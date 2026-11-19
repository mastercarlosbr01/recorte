/**
 * Orquestração: menu de contexto, leitura da seleção, download e selo.
 *
 * Este arquivo não formata nada. Ele junta três partes que vivem em lugares
 * diferentes por necessidade: a seleção só existe na página, a formatação e o
 * blob só existem no documento offscreen (o service worker não tem DOM), e o
 * download só pode ser disparado daqui.
 */

/**
 * Importado estaticamente, e não com `await import(...)` lá embaixo onde é
 * usado: a especificação de Service Workers proíbe import dinâmico, e o
 * Chrome responde com
 *
 *   TypeError: import() is disallowed on ServiceWorkerGlobalScope
 *              by the HTML specification.
 *
 * Isso não aparece no Node, onde import dinâmico é legal — foi assim que a
 * suíte inteira passou por cima do defeito sem encostar nele.
 */
import { montarNome } from '../core/nome.js';

const RAIZ = 'recorte-raiz';
const MODOS = [
  { id: 'auto', rotulo: 'menuAuto' },
  { id: 'json', rotulo: 'menuJson' },
  { id: 'xml', rotulo: 'menuXml' },
  { id: 'txt', rotulo: 'menuTxt' },
];

const OFFSCREEN = 'src/offscreen/offscreen.html';

// ------------------------------------------------------------------ menu

/**
 * `contextMenus.create` não devolve promessa e reporta falha em
 * `chrome.runtime.lastError`. Sem ler esse campo, o Chrome acumula
 * "Unchecked runtime.lastError" na aba de erros da extensão.
 */
function criarItem(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function montarMenuAgora() {
  await chrome.contextMenus.removeAll();

  // contexts: ['selection'] faz o menu só aparecer quando há texto marcado
  await criarItem({
    id: RAIZ,
    title: chrome.i18n.getMessage('menuRaiz'),
    contexts: ['selection'],
  });

  for (const m of MODOS) {
    await criarItem({
      id: `recorte-${m.id}`,
      parentId: RAIZ,
      title: chrome.i18n.getMessage(m.rotulo),
      contexts: ['selection'],
    });
  }
}

/**
 * Fila: onInstalled e onStartup podem disparar quase juntos, e sem
 * serialização as duas execuções fazem removeAll e depois ambas criam os
 * mesmos ids — o Chrome recusa com "Cannot create item with duplicate id".
 */
let fila = Promise.resolve();
function montarMenu() {
  fila = fila.then(montarMenuAgora).catch((e) => console.error('[Recorte] menu:', e));
  return fila;
}

chrome.runtime.onInstalled.addListener(montarMenu);
chrome.runtime.onStartup.addListener(montarMenu);

// ------------------------------------------------------------- offscreen

let criandoOffscreen = null;

const ESPERA_MS = 25;
const TENTATIVAS = 20; // meio segundo no total, de sobra para um documento vazio

/**
 * Espera o documento RESPONDER, não só existir.
 *
 * `offscreen.js` é carregado como módulo, e módulo é deferido: quando a
 * promessa de `createDocument()` resolve, o documento existe mas o
 * `onMessage` dele pode ainda não estar registrado. A mensagem que chega
 * nessa janela rejeita na hora com "Could not establish connection", que
 * cai no catch do clique e acende o selo de erro — uma falha intermitente,
 * que só aparece em início frio e some quando se tenta reproduzir.
 *
 * Perguntar e esperar a resposta troca uma suposição por um fato.
 */
async function esperarResposta() {
  for (let i = 0; i < TENTATIVAS; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ destino: 'offscreen', tipo: 'PING' });
      if (r?.pronto) return;
    } catch {
      // ainda não há ouvinte do outro lado; é o caso esperado aqui
    }
    await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
  }
  throw new Error('o documento offscreen não respondeu a tempo');
}

async function garantirOffscreen() {
  if (!(await chrome.offscreen.hasDocument())) {
    // dois cliques seguidos não podem tentar criar dois documentos
    criandoOffscreen ??= chrome.offscreen
      .createDocument({
        url: OFFSCREEN,
        reasons: ['DOM_PARSER', 'BLOBS'],
        justification:
          'Validar XML com DOMParser e gerar o arquivo da seleção como blob; o service worker não tem DOM.',
      })
      .catch((erro) => {
        // outra chamada pode ter criado nesse meio-tempo
        if (!String(erro).includes('Only a single offscreen')) throw erro;
      })
      .finally(() => {
        criandoOffscreen = null;
      });
    await criandoOffscreen;
  }

  // o documento existir não basta: o segundo clique também pode chegar
  // enquanto o script do primeiro ainda está carregando
  await esperarResposta();
}

// -------------------------------------------------------------- seleção

/**
 * Roda na página. É serializada para chegar lá, então precisa ser
 * autocontida: nada daqui de fora é visível dentro dela.
 *
 * `info.selectionText` não serve como fonte principal porque o Chrome
 * normaliza o espaçamento dele — as quebras de linha somem, e um JSON
 * indentado vira uma linha só.
 */
function lerSelecaoNaPagina() {
  const ativo = document.activeElement;

  // dentro de input/textarea, getSelection() volta vazio
  if (
    ativo &&
    (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA') &&
    typeof ativo.selectionStart === 'number' &&
    ativo.selectionStart !== ativo.selectionEnd
  ) {
    return {
      texto: String(ativo.value).slice(ativo.selectionStart, ativo.selectionEnd),
      titulo: document.title,
    };
  }

  const sel = window.getSelection();
  return { texto: sel ? sel.toString() : '', titulo: document.title };
}

/**
 * @param {{tabId: number, frameIds?: number[], allFrames?: boolean}} alvo
 * @param {string} reserva usada só se a injeção falhar
 *
 * O alvo muda conforme a origem. Pelo menu de contexto sabe-se o frame
 * exato do clique. Pelo atalho de teclado não há clique, então varre-se
 * todos os frames e vale o primeiro com texto — senão uma seleção dentro
 * de um iframe ficaria invisível.
 */
async function obterSelecao(alvo, reserva = '', tituloDaAba = '') {
  try {
    const resultados = await chrome.scripting.executeScript({
      target: alvo,
      func: lerSelecaoNaPagina,
    });
    const achado = resultados.find((r) => r?.result?.texto?.trim());
    if (achado) return achado.result;
  } catch (erro) {
    // páginas chrome://, a Web Store e PDFs recusam injeção
    console.debug('[Recorte]', erro);
  }

  // reserva: perde as quebras de linha, mas é melhor que não exportar nada
  return { texto: reserva, titulo: tituloDaAba };
}

// ------------------------------------------------------------------ selo

let limparSelo = null;

async function sinalizar(texto, cor) {
  try {
    await chrome.action.setBadgeText({ text: texto });
    await chrome.action.setBadgeBackgroundColor({ color: cor });
    clearTimeout(limparSelo);
    // o worker pode dormir antes disso; o selo some sozinho no próximo ciclo
    limparSelo = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
  } catch (erro) {
    console.debug('[Recorte]', erro);
  }
}

// -------------------------------------------------------------- download

/** Revoga a URL só depois que o download sai do ar, para não cortá-lo. */
function revogarQuandoTerminar(idDownload, url) {
  const aoMudar = (delta) => {
    if (delta.id !== idDownload) return;
    const fim = delta.state?.current;
    if (fim === 'complete' || fim === 'interrupted') {
      chrome.downloads.onChanged.removeListener(aoMudar);
      chrome.runtime.sendMessage({ destino: 'offscreen', tipo: 'REVOGAR', url })
        .catch(() => {});
    }
  };
  chrome.downloads.onChanged.addListener(aoMudar);
}

// ---------------------------------------------------------------- clique

/**
 * O caminho da exportação, de ponta a ponta.
 *
 * Separado do tratador de clique porque o atalho de teclado entra aqui
 * também: as duas origens diferem só em como a seleção é encontrada, e
 * duplicar o resto seria duplicar o lugar onde os defeitos moram.
 */
async function exportar(modo, aba, buscarSelecao) {
  try {
    const { texto, titulo } = await buscarSelecao();
    if (!texto.trim()) return sinalizar('—', '#64748b');

    await garantirOffscreen();

    const r = await chrome.runtime.sendMessage({
      destino: 'offscreen',
      tipo: 'EXPORTAR',
      texto,
      modo,
    });

    if (!r || r.erro) {
      console.error('[Recorte] offscreen não formatou:', r?.erro ?? '(sem resposta)');
      return sinalizar('erro', '#dc2626');
    }

    const idDownload = await chrome.downloads.download({
      url: r.url,
      filename: montarNome(titulo, r.extensao),
      saveAs: false,
    });

    revogarQuandoTerminar(idDownload, r.url);

    // pediu .json ou .xml e saiu .txt: avisa sem pedir permissão nova
    if (!r.atendido) {
      // console.error de propósito: é o único nível que chega ao botão
      // "Erros" do cartão em chrome://extensions. O selo diz QUE não coube;
      // esta linha diz POR QUE, que numa página renderizada costuma ser um
      // caractere invisível — impossível de descobrir olhando a tela.
      console.error(
        `[Recorte] pediu .${r.pedido} e saiu .txt\n    ${r.motivo ?? '(sem motivo)'}`
      );
      await sinalizar('TXT', '#b45309');
    }
  } catch (erro) {
    // console.error, não console.debug: só o error aparece no botão "Erros"
    // do cartão em chrome://extensions. Com debug, a falha fica invisível
    // sem abrir o DevTools no nível Verbose — foi exatamente isso que
    // tornou o primeiro defeito tão caro de diagnosticar.
    console.error(`[Recorte] falha ao exportar (modo ${modo}):`, erro);
    await sinalizar('erro', '#dc2626');
  }
}

// --------------------------------------------------- as duas entradas

chrome.contextMenus.onClicked.addListener((info, aba) => {
  const modo = String(info.menuItemId).replace('recorte-', '');
  if (!MODOS.some((m) => m.id === modo) || !aba?.id) return;

  // pelo menu sabe-se o frame exato do clique, e o Chrome ainda oferece
  // info.selectionText como reserva para quando a injeção é recusada
  return exportar(modo, aba, () =>
    obterSelecao(
      { tabId: aba.id, frameIds: [info.frameId ?? 0] },
      info.selectionText ?? '',
      aba.title ?? ''
    )
  );
});

/**
 * Clique no ícone abre as opções.
 *
 * Sem popup — o selo precisa do `action` livre — o ícone não fazia nada ao
 * ser clicado, o que é um beco sem saída para quem acabou de instalar e
 * procura onde mexer. A tela de opções é onde o atalho se vê.
 */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch((e) => console.error('[Recorte]', e));
});

/**
 * Atalho de teclado: sempre no modo automático.
 *
 * Quem usa atalho quer o caminho mais curto; escolher o tipo é justamente
 * a parte que o menu já resolve bem. Forçar tipo continua sendo coisa de
 * menu, e por isso o atalho não precisa de variante.
 *
 * O gesto de atalho concede activeTab igual ao clique no menu, então não
 * há permissão nova aqui — nem aviso novo na instalação.
 */
chrome.commands.onCommand.addListener(async (comando, aba) => {
  if (comando !== 'exportar-automatico') return;

  // o Chrome entrega a aba junto do comando; em versão antiga, não
  const alvo = aba?.id ? aba : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!alvo?.id) return;

  // sem clique não há frame conhecido nem info.selectionText: varre os
  // frames e fica com o primeiro que tiver seleção
  return exportar('auto', alvo, () =>
    obterSelecao({ tabId: alvo.id, allFrames: true }, '', alvo.title ?? '')
  );
});

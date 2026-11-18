/**
 * Orquestração: menu de contexto, leitura da seleção, download e selo.
 *
 * Este arquivo não formata nada. Ele junta três partes que vivem em lugares
 * diferentes por necessidade: a seleção só existe na página, a formatação e o
 * blob só existem no documento offscreen (o service worker não tem DOM), e o
 * download só pode ser disparado daqui.
 */

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
  fila = fila.then(montarMenuAgora).catch((e) => console.debug('[Recorte]', e));
  return fila;
}

chrome.runtime.onInstalled.addListener(montarMenu);
chrome.runtime.onStartup.addListener(montarMenu);

// ------------------------------------------------------------- offscreen

let criandoOffscreen = null;

async function garantirOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
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

async function obterSelecao(info, aba) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: aba.id, frameIds: [info.frameId ?? 0] },
      func: lerSelecaoNaPagina,
    });
    if (r?.result?.texto) return r.result;
  } catch (erro) {
    // páginas chrome://, a Web Store e PDFs recusam injeção
    console.debug('[Recorte]', erro);
  }

  // reserva: perde as quebras de linha, mas é melhor que não exportar nada
  return { texto: info.selectionText ?? '', titulo: aba.title ?? '' };
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

chrome.contextMenus.onClicked.addListener(async (info, aba) => {
  const modo = String(info.menuItemId).replace('recorte-', '');
  if (!MODOS.some((m) => m.id === modo) || !aba?.id) return;

  try {
    const { texto, titulo } = await obterSelecao(info, aba);
    if (!texto.trim()) return sinalizar('—', '#64748b');

    await garantirOffscreen();

    const r = await chrome.runtime.sendMessage({
      destino: 'offscreen',
      tipo: 'EXPORTAR',
      texto,
      modo,
    });

    if (!r || r.erro) {
      console.debug('[Recorte]', r?.erro);
      return sinalizar('erro', '#dc2626');
    }

    const { montarNome } = await import('../core/nome.js');
    const idDownload = await chrome.downloads.download({
      url: r.url,
      filename: montarNome(titulo, r.extensao),
      saveAs: false,
    });

    revogarQuandoTerminar(idDownload, r.url);

    // pediu .json ou .xml e saiu .txt: avisa sem pedir permissão nova
    if (!r.atendido) await sinalizar('TXT', '#b45309');
  } catch (erro) {
    console.debug('[Recorte]', erro);
    await sinalizar('erro', '#dc2626');
  }
});

/**
 * Tela de opções: mostra o atalho e leva até onde ele se troca.
 *
 * Ela não grava nada, e isso não é limitação de implementação — o Chrome
 * não deixa extensão alguma definir o próprio atalho. A troca acontece em
 * chrome://extensions/shortcuts, que é página do navegador, justamente para
 * que uma extensão não possa tomar teclas do usuário sem ele ver.
 *
 * O que esta tela resolve de verdade é o caso silencioso: quando a
 * combinação sugerida já pertence a outra extensão, o Chrome não avisa
 * nada — simplesmente deixa o comando sem tecla. Quem não souber disso
 * conclui que a extensão está quebrada.
 */

const COMANDO = 'exportar-automatico';
const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts';

/** textContent, nunca innerHTML: a auditoria reprova, e com razão. */
function traduzirMarcacao() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const texto = chrome.i18n.getMessage(el.dataset.i18n);
    if (texto) el.textContent = texto;
  }
}

async function mostrarAtalho() {
  const tecla = document.getElementById('tecla');
  const estado = document.getElementById('estado');

  let comando = null;
  try {
    const todos = await chrome.commands.getAll();
    comando = todos.find((c) => c.name === COMANDO) ?? null;
  } catch (erro) {
    console.error('[Recorte]', erro);
  }

  const atribuido = comando?.shortcut?.trim();

  if (atribuido) {
    tecla.textContent = atribuido;
    tecla.classList.remove('vazio');
    estado.textContent = chrome.i18n.getMessage('opcoesAtalhoAtivo');
    estado.classList.remove('alerta');
    return;
  }

  // o caso que motiva a tela existir
  tecla.textContent = chrome.i18n.getMessage('opcoesAtalhoSemTecla');
  tecla.classList.add('vazio');
  estado.textContent = chrome.i18n.getMessage('opcoesAtalhoConflito');
  estado.classList.add('alerta');
}

function ligarBotao() {
  const botao = document.getElementById('abrir');
  botao.textContent = chrome.i18n.getMessage('opcoesBotaoAlterar');

  // link com href chrome:// não navega a partir de página de extensão;
  // tabs.create navega, e não custa permissão nova
  botao.addEventListener('click', () => {
    chrome.tabs.create({ url: PAGINA_DE_ATALHOS });
  });
}

traduzirMarcacao();
ligarBotao();
mostrarAtalho();

// ao voltar da página de atalhos a tela pode continuar aberta atrás;
// reler no foco evita mostrar a tecla antiga
window.addEventListener('focus', mostrarAtalho);

/**
 * Simulação das APIs do Chrome usadas pelo service worker.
 *
 * O que quebra numa extensão raramente é lógica pura — é ordem de evento e
 * caminho de erro: dois gatilhos criando o menu ao mesmo tempo, a injeção
 * falhando numa página protegida, dois cliques disputando a criação do
 * offscreen. Nada disso se reproduz clicando no navegador de forma confiável.
 *
 * O offscreen simulado usa o núcleo de verdade, só sem DOMParser — que é
 * exatamente o papel do `confirmarXML` opcional.
 */

import { prepararExportacao } from '../src/core/detectar.js';

export function criarShim({ idioma = 'pt-BR' } = {}) {
  const registro = {
    erros: [],
    itensMenu: [],
    downloads: [],
    selos: [],
    urlsVivas: new Set(),
    urlsRevogadas: [],
    offscreenCriados: 0,
    execucoes: [],
  };

  const ouvintes = {
    onInstalled: [],
    onStartup: [],
    onMenuClicked: [],
    onDownloadChanged: [],
    onCommand: [],
  };

  const MENSAGENS = {
    menuRaiz: 'Exportar seleção',
    menuAuto: 'Automático',
    menuJson: '.json',
    menuXml: '.xml',
    menuTxt: '.txt',
  };

  let ultimoErro = null;
  let temOffscreen = false;
  let proximaUrl = 0;

  /**
   * O que a injeção devolve, por frame. O índice é o frameId.
   *
   * Importa ter mais de um: pelo menu a extensão injeta no frame exato do
   * clique, pelo atalho varre todos — e um atalho que só olhasse o topo
   * não enxergaria seleção dentro de iframe.
   */
  const frames = [{ texto: '', titulo: 'Página' }];
  let injecaoFalha = false;

  const disparar = (lista, ...args) => Promise.all(lista.map((f) => f(...args)));

  const chrome = {
    runtime: {
      onInstalled: { addListener: (f) => ouvintes.onInstalled.push(f) },
      onStartup: { addListener: (f) => ouvintes.onStartup.push(f) },
      get lastError() { return ultimoErro; },

      // o service worker fala com o offscreen por aqui
      async sendMessage(m) {
        if (m?.destino !== 'offscreen') return undefined;

        if (m.tipo === 'EXPORTAR') {
          if (!temOffscreen) throw new Error('offscreen não existe');
          const r = prepararExportacao(m.texto, m.modo);
          const url = `blob:simulado/${++proximaUrl}`;
          registro.urlsVivas.add(url);
          return { url, extensao: r.extensao, atendido: r.atendido, pedido: r.pedido, motivo: r.motivo };
        }

        if (m.tipo === 'REVOGAR') {
          registro.urlsVivas.delete(m.url);
          registro.urlsRevogadas.push(m.url);
          return { ok: true };
        }
        return undefined;
      },
    },

    i18n: { getMessage: (k) => MENSAGENS[k] ?? k, getUILanguage: () => idioma },

    contextMenus: {
      async removeAll() { registro.itensMenu = []; },
      create(props, callback) {
        if (registro.itensMenu.some((i) => i.id === props.id)) {
          ultimoErro = { message: `Cannot create item with duplicate id ${props.id}` };
          registro.erros.push(ultimoErro.message);
        } else {
          ultimoErro = null;
          registro.itensMenu.push(props);
        }
        if (callback) callback();
        ultimoErro = null;
      },
      onClicked: { addListener: (f) => ouvintes.onMenuClicked.push(f) },
    },

    scripting: {
      async executeScript({ target, func }) {
        registro.execucoes.push(target);
        if (injecaoFalha) throw new Error('Cannot access contents of the page');
        // rodar a função de verdade não dá: ela depende de document.
        // O que importa aqui é o contrato — o que ela devolveria.
        void func;

        // allFrames devolve um resultado por frame, na ordem do documento
        if (target.allFrames) {
          return frames.map((f) => ({ result: { texto: f.texto, titulo: f.titulo } }));
        }
        const id = target.frameIds?.[0] ?? 0;
        const f = frames[id];
        if (!f) throw new Error(`No frame with id ${id}`);
        return [{ result: { texto: f.texto, titulo: f.titulo } }];
      },
    },

    tabs: {
      async query() {
        return [{ id: 1, title: frames[0].titulo }];
      },
    },

    commands: {
      onCommand: { addListener: (f) => ouvintes.onCommand.push(f) },
    },

    offscreen: {
      async hasDocument() { return temOffscreen; },
      async createDocument() {
        if (temOffscreen) throw new Error('Only a single offscreen document may be created');
        temOffscreen = true;
        registro.offscreenCriados++;
      },
    },

    downloads: {
      async download(opcoes) {
        registro.downloads.push(opcoes);
        return registro.downloads.length;
      },
      onChanged: { addListener: (f) => ouvintes.onDownloadChanged.push(f),
                   removeListener: (f) => {
                     const i = ouvintes.onDownloadChanged.indexOf(f);
                     if (i >= 0) ouvintes.onDownloadChanged.splice(i, 1);
                   } },
    },

    action: {
      async setBadgeText({ text }) { if (text) registro.selos.push(text); },
      async setBadgeBackgroundColor() {},
    },
  };

  const simular = {
    instalar: () => disparar(ouvintes.onInstalled),
    iniciar: () => disparar(ouvintes.onStartup),

    /** Define o que o frame de topo devolveria na injeção. */
    definirPagina(texto, titulo = 'Página', falhar = false) {
      frames[0] = { texto, titulo };
      injecaoFalha = falhar;
    },

    /** Acrescenta um frame, como um iframe na página. */
    definirFrame(id, texto, titulo = 'Quadro') {
      frames[id] = { texto, titulo };
    },

    /** Dispara o atalho de teclado. */
    atalho(comando = 'exportar-automatico', aba = { id: 1, title: frames[0].titulo }) {
      return disparar(ouvintes.onCommand, comando, aba);
    },

    clicar(modo, { selectionText = '', frameId = 0, abaId = 1, titulo = 'Página' } = {}) {
      return disparar(
        ouvintes.onMenuClicked,
        { menuItemId: `recorte-${modo}`, selectionText, frameId },
        { id: abaId, title: titulo }
      );
    },

    /** O download terminou: é o gatilho que revoga a URL. */
    terminarDownload(id, estado = 'complete') {
      return disparar([...ouvintes.onDownloadChanged], { id, state: { current: estado } });
    },
  };

  return { chrome, registro, simular };
}

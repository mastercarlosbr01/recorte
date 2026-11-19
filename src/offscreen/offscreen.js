/**
 * Documento offscreen: é aqui que a formatação acontece.
 *
 * Existe por duas carências do service worker MV3, que não tem DOM:
 *
 *   DOMParser            — para confirmar que o XML é bem formado
 *   URL.createObjectURL  — para gerar o arquivo sem o teto da URL data:
 *
 * A alternativa seria injetar os formatadores na página do usuário. Preferiu-se
 * não: quanto menos código a extensão roda no site alheio, melhor. A página só
 * devolve a string selecionada; todo o resto acontece aqui dentro, na origem
 * da própria extensão.
 */

import { prepararExportacao } from '../core/detectar.js';

/**
 * Segunda opinião sobre o XML.
 *
 * O analisador de src/core/xml.js é a fonte da verdade (é ele que está sob
 * teste). O DOMParser entra como confirmação: se os dois discordarem, o
 * conservador vence e o conteúdo vira .txt. Custa uma chamada e evita
 * publicar como .xml algo que o navegador recusaria.
 */
function confirmarXML(texto) {
  try {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    return !doc.querySelector('parsererror');
  } catch {
    return false;
  }
}

/** URLs vivas, para poder revogar depois que o download começa. */
const urls = new Set();

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (mensagem?.destino !== 'offscreen') return;

  if (mensagem.tipo === 'EXPORTAR') {
    try {
      const r = prepararExportacao(mensagem.texto, mensagem.modo, { confirmarXML });

      // UTF-8 sem BOM: o Blob não escreve BOM, e o type leva o charset
      const blob = new Blob([r.texto], { type: `text/plain;charset=utf-8` });
      const url = URL.createObjectURL(blob);
      urls.add(url);

      responder({
        url,
        extensao: r.extensao,
        atendido: r.atendido,
        pedido: r.pedido,
        motivo: r.motivo,
      });
    } catch (erro) {
      responder({ erro: String(erro?.message ?? erro) });
    }
    return true;
  }

  if (mensagem.tipo === 'REVOGAR') {
    if (urls.has(mensagem.url)) {
      URL.revokeObjectURL(mensagem.url);
      urls.delete(mensagem.url);
    }
    responder({ ok: true });
    return true;
  }
});

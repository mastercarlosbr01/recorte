/**
 * Decide o que o arquivo vai ser.
 *
 * Regra única e previsível: se o conteúdo não é o que foi pedido, vira .txt.
 * Nunca se tenta consertar o conteúdo para que ele caiba no tipo pedido —
 * adivinhar a intenção estraga o dado mais vezes do que acerta, e o usuário
 * perde a única cópia que tinha.
 */

import { formatarJSON } from './json.js';
import { formatarXML } from './xml.js';
import { formatarTXT } from './txt.js';

export const MODOS = ['auto', 'json', 'xml', 'txt'];

/**
 * @param {string} texto seleção crua
 * @param {'auto'|'json'|'xml'|'txt'} modo
 * @param {{confirmarXML?: (t: string) => boolean}} [opcoes]
 * @returns {{texto: string, extensao: string, atendido: boolean, pedido: string}}
 *
 * `atendido: false` significa "pediu json ou xml e saiu txt" — é o que
 * acende o selo no ícone.
 */
export function prepararExportacao(texto, modo = 'auto', opcoes = {}) {
  const { confirmarXML } = opcoes;
  const cair = (pedido) => ({ ...formatarTXT(texto), extensao: 'txt', atendido: false, pedido });

  if (modo === 'txt') {
    return { ...formatarTXT(texto), extensao: 'txt', atendido: true, pedido: 'txt' };
  }

  if (modo === 'json') {
    const r = formatarJSON(texto);
    return r.ok
      ? { texto: r.texto, extensao: 'json', atendido: true, pedido: 'json' }
      : cair('json');
  }

  if (modo === 'xml') {
    const r = formatarXML(texto, confirmarXML);
    return r.ok
      ? { texto: r.texto, extensao: 'xml', atendido: true, pedido: 'xml' }
      : cair('xml');
  }

  // automático: JSON primeiro porque é o mais frequente e o mais barato de
  // validar; XML depois; o resto é texto, e texto nunca é uma falha
  const j = formatarJSON(texto);
  if (j.ok) return { texto: j.texto, extensao: 'json', atendido: true, pedido: 'auto' };

  const x = formatarXML(texto, confirmarXML);
  if (x.ok) return { texto: x.texto, extensao: 'xml', atendido: true, pedido: 'auto' };

  return { ...formatarTXT(texto), extensao: 'txt', atendido: true, pedido: 'auto' };
}

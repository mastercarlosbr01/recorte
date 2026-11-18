/**
 * Nome do arquivo a partir do título da página.
 *
 * O Windows é o mais restritivo dos três sistemas, então a regra dele manda:
 * \ / : * ? " < > | são proibidos, nome não pode terminar em ponto nem em
 * espaço, e há nomes reservados (CON, NUL, COM1...) que o sistema recusa
 * mesmo com extensão.
 */

const INVALIDOS = /[\\/:*?"<>|]/g;
const CONTROLE = /[\u0000-\u001F\u007F]/g;
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const LIMITE = 60;
const PADRAO = 'selecao';

/** aaaa-mm-dd na data local, não em UTC: o usuário pensa no fuso dele. */
export function dataDeHoje(agora = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function slugificar(titulo) {
  const base = String(titulo ?? '')
    .replace(CONTROLE, '')
    .replace(INVALIDOS, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, LIMITE)
    // o corte pode deixar um hífen solto na ponta
    .replace(/[-.]+$/g, '');

  if (!base) return PADRAO;
  // reservado do Windows recusa mesmo com extensão; o prefixo resolve
  return RESERVADOS.test(base) ? `_${base}` : base;
}

/**
 * @param {string} titulo título da página; pode vir vazio
 * @param {string} extensao sem o ponto
 * @returns {string} ex.: resposta-api_2026-11-18.json
 */
export function montarNome(titulo, extensao, agora = new Date()) {
  return `${slugificar(titulo)}_${dataDeHoje(agora)}.${extensao}`;
}

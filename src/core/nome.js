/**
 * Nome do arquivo a partir do título da página.
 *
 * O Windows é o mais restritivo dos três sistemas, então a regra dele manda:
 * \ / : * ? " < > | são proibidos, nome não pode terminar em ponto nem em
 * espaço, e há nomes reservados (CON, NUL, COM1...) que o sistema recusa
 * mesmo com extensão.
 */

/**
 * O título da página é entrada não confiável: quem escreveu a página
 * escolhe o que vai nele, e ele vira o nome de um arquivo no disco de quem
 * instalou a extensão. Três grupos saem fora, por motivos diferentes.
 *
 *   Proibidos pelo Windows (\ / : * ? " < > |) e caracteres de controle.
 *   Sem eles o sistema recusa o nome, ou pior, a barra cria subpasta — o
 *   `filename` do chrome.downloads.download é um caminho relativo à pasta
 *   de downloads e aceita subdiretório por projeto.
 *
 *   Porcentagem. O Chromium já expandiu variável de ambiente dentro do
 *   nome de download — %USERNAME% vazando o nome da conta — e também já
 *   teve o truque "arquivo.lnk.%%", em que remover o %% ressuscitava a
 *   extensão perigosa anterior. Os dois foram corrigidos lá, mas a
 *   sanitização do navegador é piso, não teto: o título vem da página e a
 *   defesa tem que existir aqui também.
 *
 *   Marcas de direção de texto (U+200E, U+200F, U+202A–U+202E,
 *   U+2066–U+2069). Elas invertem a exibição do nome na tela sem mudar os
 *   bytes: é o truque de fazer "nota-exe.txt" aparecer como
 *   "nota-txt.exe". Aqui a extensão final é sempre nossa, mas um nome que
 *   mente para quem está olhando é problema por si só.
 *
 * Os pontos de código vão em número, sem sequência de escape: uma barra
 * invertida escrita como escape já se perdeu uma vez neste projeto e
 * silenciosamente tirou a barra da lista de proibidos.
 */
const PROIBIDOS_WINDOWS = '/:*?"<>|';

function ehCaractereProibido(c) {
  const n = c.codePointAt(0);
  return (
    n <= 0x1f ||                      // controle
    n === 0x7f ||                     // delete
    n === 0x25 ||                     // %
    n === 0x5c ||                     // barra invertida
    n === 0x200e || n === 0x200f ||   // marcas de direção
    (n >= 0x202a && n <= 0x202e) ||
    (n >= 0x2066 && n <= 0x2069) ||
    PROIBIDOS_WINDOWS.includes(c)
  );
}

/** Remove de uma vez tudo que não pode sobreviver ao título. */
function peneirar(texto) {
  let saida = '';
  for (const c of texto) if (!ehCaractereProibido(c)) saida += c;
  return saida;
}

const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const LIMITE = 60;
const PADRAO = 'selecao';

/** aaaa-mm-dd na data local, não em UTC: o usuário pensa no fuso dele. */
export function dataDeHoje(agora = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function slugificar(titulo) {
  const base = peneirar(String(titulo ?? ''))
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

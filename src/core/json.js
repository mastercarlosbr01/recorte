/**
 * Formatação de JSON por reindentação do TEXTO ORIGINAL.
 *
 * A tentação é `JSON.stringify(JSON.parse(texto), null, 2)`. Isso corrompe
 * dado silenciosamente, de quatro formas:
 *
 *   1234567890123456789  ->  1234567890123456800   (precisão de double)
 *   {"a":1,"a":2}        ->  {"a":2}               (chave duplicada some)
 *   1.0                  ->  1                     (número reescrito)
 *   1e3                  ->  1000                  (notação reescrita)
 *
 * Quem exporta resposta de API precisa do byte que veio, não de uma
 * reconstrução. Então `JSON.parse` serve só para dizer "é válido"; o texto
 * emitido é o original, com o espaçamento refeito caractere a caractere.
 */

const INDENT = '  ';

/**
 * Invisíveis que o JSON não aceita como espaçamento.
 *
 * A norma admite exatamente quatro: espaço, tabulação, LF e CR. Qualquer
 * outro caractere invisível reprova no `JSON.parse`, por mais que a tela o
 * desenhe idêntico a um espaço comum.
 *
 * Isso não é teórico. O visualizador de JSON embutido no Chrome indenta com
 * espaço não separável (U+00A0), então copiar um JSON de resposta de API —
 * o caso de uso central desta extensão — produz um texto que parece JSON,
 * é JSON aos olhos de qualquer pessoa, e reprova na validação. Páginas
 * renderizadas em geral também carregam U+200B, U+FEFF e parentes.
 *
 * A faixa 0x2000-0x200D cobre de uma vez os espaços tipográficos e os de
 * largura zero (0x200B, 0x200C, 0x200D), que `\s` não pega.
 */
function ehInvisivelForaDoJSON(c) {
  const n = c.codePointAt(0);
  return (
    n === 0x00a0 || // espaço não separável — o do visualizador do Chrome
    n === 0x1680 || // espaço ogham
    (n >= 0x2000 && n <= 0x200d) || // espaços tipográficos e os de largura zero
    n === 0x2028 || // separador de linha
    n === 0x2029 || // separador de parágrafo
    n === 0x202f || // espaço não separável estreito
    n === 0x205f || // espaço matemático médio
    n === 0x2060 || // juntador de palavras
    n === 0x3000 || // espaço ideográfico
    n === 0xfeff    // BOM / espaço não separável de largura zero
  );
}

/**
 * Troca por espaço comum os invisíveis que só atrapalham — SÓ FORA DAS ASPAS.
 *
 * A ressalva é o ponto inteiro desta função. Dentro de uma string, U+00A0 é
 * conteúdo: trocá-lo alteraria o dado do usuário, que é exatamente o que
 * este módulo existe para nunca fazer. Fora das aspas ele é só espaçamento,
 * e o espaçamento vai ser refeito pela reindentação de qualquer maneira.
 */
export function normalizarEspacos(texto) {
  let saida = '';
  let dentroString = false;
  let escapado = false;

  for (const c of texto) {
    if (dentroString) {
      saida += c;
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') dentroString = false;
      continue;
    }

    if (c === '"') {
      dentroString = true;
      saida += c;
      continue;
    }

    saida += ehInvisivelForaDoJSON(c) ? ' ' : c;
  }

  return saida;
}

/** Só valida. O resultado do parse é descartado de propósito. */
export function ehJSONValido(texto) {
  try {
    JSON.parse(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reindenta preservando cada token como veio.
 *
 * O estado que importa é "estou dentro de uma string?" — lá dentro, chave,
 * colchete, vírgula e dois-pontos são conteúdo, não estrutura. E `\"` não
 * fecha a string.
 */
export function reindentarJSON(texto) {
  const n = texto.length;
  let saida = '';
  let nivel = 0;
  let i = 0;

  /** Primeiro caractere não-branco a partir de k, para detectar {} e []. */
  const espiar = (k) => {
    while (k < n && /\s/.test(texto[k])) k++;
    return k < n ? texto[k] : '';
  };

  while (i < n) {
    const c = texto[i];

    // ---- string: copiada literalmente, incluindo escapes
    if (c === '"') {
      saida += c;
      i++;
      while (i < n) {
        const s = texto[i];
        saida += s;
        if (s === '\\') {
          // o caractere escapado vai junto, seja ele qual for — inclusive \"
          i++;
          if (i < n) saida += texto[i];
          i++;
          continue;
        }
        i++;
        if (s === '"') break;
      }
      continue;
    }

    // o espaçamento original é descartado; o novo é inserido pela estrutura
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === '{' || c === '[') {
      const fecha = c === '{' ? '}' : ']';
      // vazio fica na mesma linha: {} e [] em vez de duas linhas
      if (espiar(i + 1) === fecha) {
        saida += c + fecha;
        i++;
        while (i < n && texto[i] !== fecha) i++;
        i++;
        continue;
      }
      nivel++;
      saida += c + '\n' + INDENT.repeat(nivel);
      i++;
      continue;
    }

    if (c === '}' || c === ']') {
      nivel--;
      saida += '\n' + INDENT.repeat(Math.max(nivel, 0)) + c;
      i++;
      continue;
    }

    if (c === ',') {
      saida += ',\n' + INDENT.repeat(nivel);
      i++;
      continue;
    }

    if (c === ':') {
      saida += ': ';
      i++;
      continue;
    }

    // número, true, false, null: copiados como vieram
    saida += c;
    i++;
  }

  return saida;
}

/**
 * Recorta sobra em volta do JSON.
 *
 * Seleção de tela frequentemente vem com ruído: "Response: {...}" ou um
 * rótulo antes do colchete. Vai do primeiro { ou [ até o último } ou ].
 */
export function recortarJSON(texto) {
  const inicios = [texto.indexOf('{'), texto.indexOf('[')].filter((k) => k >= 0);
  if (inicios.length === 0) return null;

  const ini = Math.min(...inicios);
  const fim = Math.max(texto.lastIndexOf('}'), texto.lastIndexOf(']'));
  if (fim <= ini) return null;

  const recorte = texto.slice(ini, fim + 1);
  return recorte === texto ? null : recorte;
}

/**
 * @param {string} texto
 * @returns {{ok: boolean, texto: string|null}}
 *
 * Exige que comece em { ou [. `123`, `true` e `"abc"` são JSON válido pela
 * norma, mas tratar uma seleção dessas como arquivo .json seria falso
 * positivo — no modo automático qualquer número viraria JSON.
 *
 * Não conserta nada. Saída de mongosh (ObjectId(...), ISODate(...)), aspas
 * simples, vírgula sobrando e comentário caem para .txt, que é o certo:
 * adivinhar a intenção do usuário estraga o dado com mais frequência do que
 * acerta.
 */
export function formatarJSON(texto) {
  // Normalizar ANTES de validar. O JSON.parse é a única autoridade sobre
  // "isto é JSON", e ele reprova invisíveis que a tela mostra como espaço.
  const limpo = normalizarEspacos(texto).trim();

  const tentar = (candidato) => {
    if (!candidato) return null;
    const c = candidato.trim();
    if (!c.startsWith('{') && !c.startsWith('[')) return null;
    return ehJSONValido(c) ? { ok: true, texto: reindentarJSON(c) } : null;
  };

  return tentar(limpo) ?? tentar(recortarJSON(limpo)) ?? { ok: false, texto: null };
}

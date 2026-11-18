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
  const limpo = texto.trim();

  const tentar = (candidato) => {
    if (!candidato) return null;
    const c = candidato.trim();
    if (!c.startsWith('{') && !c.startsWith('[')) return null;
    return ehJSONValido(c) ? { ok: true, texto: reindentarJSON(c) } : null;
  };

  return tentar(limpo) ?? tentar(recortarJSON(limpo)) ?? { ok: false, texto: null };
}

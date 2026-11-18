/**
 * Limpeza de texto puro.
 *
 * O princípio aqui é não ser esperto: mexe-se no que é ruído de cópia
 * (espaço no fim da linha, quebra de linha do Windows, espaço não separável
 * que veio do HTML) e não se encosta no que pode ser significado — a
 * indentação do começo das linhas fica como está, porque em código, log e
 * YAML ela é conteúdo.
 */

export function limparTXT(texto) {
  const normalizado = texto
    .replace(/\r\n?/g, '\n')
    // U+00A0 vem junto quando se copia de página; parece espaço e não é
    .replace(/\u00A0/g, ' ')
    // espaço no fim da linha é sempre ruído
    .replace(/[ \t]+$/gm, '');

  return normalizado
    // três ou mais linhas em branco viram uma; duas continuam duas
    .replace(/\n{4,}/g, '\n\n')
    // linhas em branco nas pontas
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** Sempre dá certo: é o destino de tudo que não validou como JSON ou XML. */
export function formatarTXT(texto) {
  return { ok: true, texto: limparTXT(texto) };
}

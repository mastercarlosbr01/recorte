/**
 * O risco no XML é indentar onde espaço é conteúdo, e normalizar o que não
 * deveria. Cada caso abaixo é algo que um XMLSerializer estragaria.
 *
 * Rodar: node tests/xml.test.mjs
 */
import { formatarXML, tokenizarXML, montarArvore } from '../src/core/xml.js';

let falhas = 0;
function ok(condicao, mensagem) {
  if (condicao) return;
  falhas++;
  console.error(`  FALHOU: ${mensagem}`);
}
function igual(obtido, esperado, mensagem) {
  ok(obtido === esperado,
    `${mensagem}\n          obtido:\n${obtido}\n          esperado:\n${esperado}`);
}

// ------------------------------------------------------------ indentação

console.log('\n== indentação de elementos aninhados ==');
igual(formatarXML('<a><b>1</b><c>2</c></a>').texto,
  '<a>\n  <b>1</b>\n  <c>2</c>\n</a>', 'dois filhos');

igual(formatarXML('<a><b><c>x</c></b></a>').texto,
  '<a>\n  <b>\n    <c>x</c>\n  </b>\n</a>', 'três níveis');

igual(formatarXML('<a></a>').texto, '<a></a>', 'elemento vazio fica numa linha');
igual(formatarXML('<a/>').texto, '<a/>', 'autofechado');
igual(formatarXML('<a><b/><c/></a>').texto,
  '<a>\n  <b/>\n  <c/>\n</a>', 'autofechados aninhados');

// já indentado e minificado devem convergir
const min = '<a><b>1</b></a>';
const ind = '<a>\n        <b>1</b>\n</a>';
igual(formatarXML(ind).texto, formatarXML(min).texto, 'já indentado difere do minificado');
console.log('  OK');

// ------------------------------------------------------- conteúdo misto

console.log('\n== conteúdo misto sai intocado ==');
const misto = '<p>Olá <b>mundo</b> tudo bem</p>';
igual(formatarXML(misto).texto, misto, 'espaço em conteúdo misto foi alterado');

const mistoAninhado = '<doc><p>Olá <b>mundo</b></p><q>x</q></doc>';
igual(formatarXML(mistoAninhado).texto,
  '<doc>\n  <p>Olá <b>mundo</b></p>\n  <q>x</q>\n</doc>',
  'o pai indentou, mas o parágrafo misto tinha de ficar intacto');

// texto com quebras dentro de elemento folha
igual(formatarXML('<a>linha 1\nlinha 2</a>').texto, '<a>linha 1\nlinha 2</a>',
  'quebra dentro de texto foi alterada');
console.log('  OK');

// ----------------------------------------------------------- preservação

console.log('\n== o que precisa sobreviver sem um byte a menos ==');

const decl = '<?xml version="1.0" encoding="UTF-8"?><a><b>1</b></a>';
ok(formatarXML(decl).texto.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
  `declaração alterada: ${formatarXML(decl).texto}`);

const comentario = '<a><!-- nota importante --><b>1</b></a>';
ok(formatarXML(comentario).texto.includes('<!-- nota importante -->'),
  `comentário alterado: ${formatarXML(comentario).texto}`);

const cdata = '<a><![CDATA[ if (x < 1 && y > 2) { } ]]></a>';
ok(formatarXML(cdata).texto.includes('<![CDATA[ if (x < 1 && y > 2) { } ]]>'),
  `CDATA alterado: ${formatarXML(cdata).texto}`);

const pi = '<?xml version="1.0"?><?xml-stylesheet href="e.xsl"?><a>1</a>';
ok(formatarXML(pi).texto.includes('<?xml-stylesheet href="e.xsl"?>'),
  `instrução de processamento alterada: ${formatarXML(pi).texto}`);

const ns = '<ns:raiz xmlns:ns="http://exemplo/n" xmlns="http://exemplo/d"><ns:x>1</ns:x></ns:raiz>';
const rNs = formatarXML(ns).texto;
ok(rNs.includes('xmlns:ns="http://exemplo/n"') && rNs.includes('xmlns="http://exemplo/d"'),
  `namespace alterado: ${rNs}`);
ok(rNs.includes('<ns:x>1</ns:x>'), `prefixo de namespace perdido: ${rNs}`);

const atribs = '<a zeta="1" alfa="2" meio=\'3\'><b/></a>';
const rAtribs = formatarXML(atribs).texto;
ok(rAtribs.includes('zeta="1" alfa="2" meio=\'3\''),
  `ordem ou aspas dos atributos mudaram: ${rAtribs}`);

const entidades = '<a>&lt;tag&gt; &amp; &#233; &naoexiste;</a>';
ok(formatarXML(entidades).texto.includes('&lt;tag&gt; &amp; &#233; &naoexiste;'),
  `entidade expandida ou alterada: ${formatarXML(entidades).texto}`);

const maiorDentroDeAtributo = '<a titulo="x > y"><b/></a>';
ok(formatarXML(maiorDentroDeAtributo).ok,
  '`>` dentro de aspas de atributo quebrou o analisador');
console.log('  OK declaração, comentário, CDATA, PI, namespace, atributos e entidades');

// ---------------------------------------------------- o que cai para txt

console.log('\n== o que NÃO deve virar .xml ==');
for (const [rotulo, entrada] of [
  ['HTML com tag sem fechamento', '<p>a<br>b</p>'],
  ['HTML solto', '<div><span>oi</span>'],
  ['dois elementos raiz', '<a>1</a><b>2</b>'],
  ['fechamento trocado', '<a><b>1</a></b>'],
  ['fechamento sem abertura', '</a>'],
  ['texto fora do raiz', 'sobra <a>1</a>'],
  ['tag não fechada', '<a'],
  ['comentário não fechado', '<a><!-- nota</a>'],
  ['CDATA não fechado', '<a><![CDATA[ x </a>'],
  ['texto comum', 'isso é só um parágrafo'],
  ['vazio', ''],
  ['JSON', '{"a":1}'],
  ['nenhum elemento', '<!-- só um comentário -->'],
]) {
  ok(!formatarXML(entrada).ok, `${rotulo} foi aceito como XML: ${JSON.stringify(entrada)}`);
}
console.log('  OK HTML mal formado, raiz dupla e sobra caem fora');

// --------------------------------------------- checagem extra do navegador

console.log('\n== checagem extra pode vetar ==');
const valido = '<a><b>1</b></a>';
ok(formatarXML(valido, () => true).ok, 'checagem extra aprovando não deveria mudar nada');
ok(!formatarXML(valido, () => false).ok,
  'checagem extra reprovando tinha de derrubar para .txt');
console.log('  OK o conservador vence');

// ------------------------------------------------------------ auxiliares

console.log('\n== auxiliares ==');
const t = tokenizarXML('<?xml version="1.0"?><a><!-- c --><b/>t</a>');
ok(!t.erro, `tokenizador falhou: ${t.erro}`);
const tipos = t.tokens.map((x) => x.tipo).join(',');
ok(tipos.includes('declaracao') && tipos.includes('comentario') && tipos.includes('autofechado'),
  `tipos de token errados: ${tipos}`);
ok(montarArvore('<a>1</a>', tokenizarXML('<a>1</a>').tokens).raiz, 'árvore não foi montada');
console.log('  OK');

console.log(falhas === 0 ? '\nTUDO VERDE\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);

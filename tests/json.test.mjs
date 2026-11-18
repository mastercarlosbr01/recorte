/**
 * O ponto destes testes é provar que o texto original sobrevive.
 *
 * Quase todo formatador de JSON por aí faz parse e stringify, e com isso
 * corrompe dado sem avisar. Cada caso abaixo é um dado que aquela abordagem
 * destruiria.
 *
 * Rodar: node tests/json.test.mjs
 */
import { formatarJSON, reindentarJSON, ehJSONValido, recortarJSON } from '../src/core/json.js';

let falhas = 0;
function ok(condicao, mensagem) {
  if (condicao) return;
  falhas++;
  console.error(`  FALHOU: ${mensagem}`);
}
function igual(obtido, esperado, mensagem) {
  ok(obtido === esperado,
    `${mensagem}\n          obtido:   ${JSON.stringify(obtido)}\n          esperado: ${JSON.stringify(esperado)}`);
}

// ------------------------------------------------- o que stringify destrói

console.log('\n== dado que parse+stringify corromperia ==');

const grande = '{"id":1234567890123456789}';
ok(formatarJSON(grande).texto.includes('1234567890123456789'),
  `inteiro de 19 dígitos perdido: ${formatarJSON(grande).texto}`);
// a prova de que o perigo é real
ok(String(JSON.parse(grande).id) !== '1234567890123456789',
  'o teste perdeu o sentido: JSON.parse não está mais arredondando este número');

const dup = '{"a":1,"a":2}';
const rDup = formatarJSON(dup).texto;
ok((rDup.match(/"a"/g) ?? []).length === 2, `chave duplicada perdida: ${rDup}`);
ok(rDup.includes('1') && rDup.includes('2'), `valor da chave duplicada perdido: ${rDup}`);

const nums = '{"a":1.0,"b":1e3,"c":1.50,"d":-0.0,"e":1E+5}';
const rNums = formatarJSON(nums).texto;
for (const t of ['1.0', '1e3', '1.50', '-0.0', '1E+5']) {
  ok(rNums.includes(t), `número reescrito, "${t}" sumiu de: ${rNums}`);
}

const uni = '{"a":"caf\\u00e9"}';
ok(formatarJSON(uni).texto.includes('\\u00e9'),
  `escape unicode foi expandido: ${formatarJSON(uni).texto}`);
console.log('  OK inteiro grande, chave duplicada, números e unicode escapado intactos');

// --------------------------------------------- estrutura dentro de string

console.log('\n== estrutura dentro de string não conta como estrutura ==');

const chaves = '{"a":"x{y}z","b":"[1,2]","c":"k:v","d":"v,w"}';
const rChaves = formatarJSON(chaves);
ok(rChaves.ok, 'JSON com pontuação dentro de string foi recusado');
for (const t of ['"x{y}z"', '"[1,2]"', '"k:v"', '"v,w"']) {
  ok(rChaves.texto.includes(t), `string alterada, ${t} sumiu de:\n${rChaves.texto}`);
}

const aspas = '{"a":"di\\"z","b":"fim\\\\"}';
const rAspas = formatarJSON(aspas);
ok(rAspas.ok, 'JSON com aspas escapadas foi recusado');
ok(rAspas.texto.includes('"di\\"z"'), `\\" tratado como fim de string: ${rAspas.texto}`);
ok(rAspas.texto.includes('"fim\\\\"'), `barra escapada no fim quebrou: ${rAspas.texto}`);
console.log('  OK { } [ ] , : e \\" dentro de string');

// --------------------------------------------------------- vazios e forma

console.log('\n== vazios na mesma linha ==');
igual(formatarJSON('{}').texto, '{}', 'objeto vazio');
igual(formatarJSON('[]').texto, '[]', 'lista vazia');
igual(formatarJSON('{ }').texto, '{}', 'objeto vazio com espaço dentro');
igual(formatarJSON('{"a":{},"b":[]}').texto,
  '{\n  "a": {},\n  "b": []\n}', 'vazios aninhados');
console.log('  OK');

console.log('\n== indentação ==');
igual(formatarJSON('{"a":1}').texto, '{\n  "a": 1\n}', 'objeto simples');
igual(formatarJSON('[1,2]').texto, '[\n  1,\n  2\n]', 'lista simples');
igual(formatarJSON('{"a":{"b":{"c":1}}}').texto,
  '{\n  "a": {\n    "b": {\n      "c": 1\n    }\n  }\n}', 'três níveis');
console.log('  OK 2 espaços por nível');

// -------------------------------------------------- idempotência da forma

console.log('\n== minificado e já indentado dão o mesmo resultado ==');
const minificado = '{"a":1,"b":[1,2],"c":{"d":null}}';
const indentado = '{\n    "a": 1,\n    "b": [\n        1,\n        2\n    ],\n    "c": {\n        "d": null\n    }\n}';
const comTabs = '{\t"a":\t1,\n\t"b":[1,\t2],"c":{"d":null}}';
const alvo = formatarJSON(minificado).texto;
igual(formatarJSON(indentado).texto, alvo, 'já indentado difere do minificado');
igual(formatarJSON(comTabs).texto, alvo, 'com tabulação difere do minificado');
// aplicar duas vezes não muda nada
igual(formatarJSON(alvo).texto, alvo, 'formatar o já formatado mudou o resultado');
console.log('  OK forma independe do espaçamento de entrada');

// ------------------------------------------------------- seleção com sobra

console.log('\n== seleção com sobra em volta ==');
const comPrefixo = 'Response: {"ok":true}';
ok(formatarJSON(comPrefixo).ok, 'prefixo não foi recortado');
igual(formatarJSON(comPrefixo).texto, '{\n  "ok": true\n}', 'recorte com prefixo');

const comSufixo = '[1,2] // fim da resposta';
ok(formatarJSON(comSufixo).ok, 'sufixo não foi recortado');
igual(formatarJSON(comSufixo).texto, '[\n  1,\n  2\n]', 'recorte com sufixo');

const ambos = 'curl -s api | jq\n{"a":1}\nDone.';
ok(formatarJSON(ambos).ok, 'prefixo e sufixo não foram recortados');
console.log('  OK');

// ------------------------------------------------------ o que cai para txt

console.log('\n== o que NÃO deve virar .json ==');

const mongosh = `{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  criadoEm: ISODate("2026-11-18T10:00:00Z")
}`;
ok(!formatarJSON(mongosh).ok, 'saída de mongosh foi aceita como JSON');

for (const [rotulo, entrada] of [
  ['vírgula sobrando em objeto', '{"a":1,}'],
  ['vírgula sobrando em lista', '[1,2,]'],
  ['aspas simples', "{'a':1}"],
  ['chave sem aspas', '{a:1}'],
  // comentário DENTRO do JSON — diferente de sobra depois dele, que é recortada
  ['comentário de linha dentro', '{\n  // nota\n  "a": 1\n}'],
  ['comentário de bloco dentro', '{"a": /* nota */ 1}'],
  ['sobra que contém chave solta', '{"a":1} fim }'],
  ['chave não fechada', '{"a":1'],
  ['texto comum', 'isso é só um parágrafo qualquer'],
  ['vazio', ''],
  ['número solto', '123'],
  ['booleano solto', 'true'],
  ['string solta', '"abc"'],
]) {
  ok(!formatarJSON(entrada).ok, `${rotulo} foi aceito como JSON: ${JSON.stringify(entrada)}`);
}
console.log('  OK mongosh, vírgula sobrando, aspas simples e escalares soltos caem fora');

// ------------------------------------------------------------- auxiliares

console.log('\n== auxiliares ==');
ok(ehJSONValido('{"a":1}'), 'ehJSONValido recusou JSON válido');
ok(!ehJSONValido('{a:1}'), 'ehJSONValido aceitou JSON inválido');
ok(recortarJSON('xx {"a":1} yy') === '{"a":1}', 'recorte errado');
ok(recortarJSON('{"a":1}') === null, 'recorte deveria devolver null quando não há sobra');
ok(recortarJSON('sem chaves aqui') === null, 'recorte deveria devolver null sem delimitador');
console.log('  OK');

// ------------------------------------------------- preservação byte a byte

console.log('\n== o conteúdo, sem o espaçamento, é idêntico ao original ==');
for (const entrada of [
  '{"id":1234567890123456789,"a":1.0,"b":"x{y}","c":[1,{"d":null}],"e":{}}',
  '[{"a":"di\\"z"},{"b":"caf\\u00e9"},[],{}]',
]) {
  const semEspaco = (s) => s.replace(/(^|[^\\])\s+/g, (m, p) => p);
  const r = formatarJSON(entrada);
  ok(r.ok, `recusou entrada válida: ${entrada}`);
  // fora das strings o espaçamento muda; comparar token a token é o bastante
  const tokens = (s) => s.replace(/\s*([{}\[\],:])\s*/g, '$1');
  igual(tokens(r.texto), tokens(entrada), 'conteúdo alterado além do espaçamento');
}
console.log('  OK só o espaçamento mudou');

console.log(falhas === 0 ? '\nTUDO VERDE\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);

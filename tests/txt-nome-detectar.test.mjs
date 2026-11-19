/**
 * Limpeza de texto, nome de arquivo e a decisão do tipo.
 *
 * Rodar: node tests/txt-nome-detectar.test.mjs
 */
import { limparTXT } from '../src/core/txt.js';
import { slugificar, montarNome, dataDeHoje } from '../src/core/nome.js';
import { prepararExportacao } from '../src/core/detectar.js';

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

// ------------------------------------------------------------------- TXT

console.log('\n== limpeza de texto ==');

igual(limparTXT('a   \nb\t\t\nc'), 'a\nb\nc', 'espaço e tabulação no fim da linha');
igual(limparTXT('a\r\nb\rc'), 'a\nb\nc', 'quebra do Windows e do Mac antigo');
igual(limparTXT('a b'), 'a b', 'espaço não separável');
igual(limparTXT('\n\n\na\n\n\n'), 'a', 'linhas em branco nas pontas');

// três ou mais viram uma; duas continuam duas
igual(limparTXT('a\n\n\n\nb'), 'a\n\nb', 'quatro quebras viram duas');
igual(limparTXT('a\n\n\n\n\n\nb'), 'a\n\nb', 'seis quebras viram duas');
// "3 ou mais linhas em branco viram 1" — com duas, nada muda
igual(limparTXT('a\n\n\nb'), 'a\n\n\nb', 'duas linhas em branco permanecem');
igual(limparTXT('a\n\nb'), 'a\n\nb', 'uma linha em branco permanece');

// o que NÃO pode mudar
igual(limparTXT('    indentado\n\tcom tab'), '    indentado\n\tcom tab',
  'indentação do começo da linha foi alterada');
igual(limparTXT('def f():\n    return 1'), 'def f():\n    return 1',
  'indentação de código alterada');
igual(limparTXT(''), '', 'texto vazio');
igual(limparTXT('   \n   \n   '), '', 'só espaço vira vazio');
console.log('  OK limpa o ruído e preserva a indentação inicial');

// ---------------------------------------------------- nome de arquivo

console.log('\n== nome de arquivo ==');

igual(slugificar('Resposta API'), 'resposta-api', 'slug básico');
igual(slugificar('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij', 'caracteres proibidos no Windows');
igual(slugificar(''), 'selecao', 'título vazio');
igual(slugificar('   '), 'selecao', 'título só com espaço');
igual(slugificar(null), 'selecao', 'título nulo');
igual(slugificar('///'), 'selecao', 'título que vira vazio depois da limpeza');
igual(slugificar('a\u0000b\u001Fc'), 'abc', 'caracteres de controle');
igual(slugificar('Olá Mundo Ção'), 'olá-mundo-ção', 'acentos preservados');
igual(slugificar('a   b___c'), 'a-b-c', 'espaços e sublinhados colapsam em hífen');
igual(slugificar('...nome...'), 'nome', 'pontos nas pontas');
igual(slugificar('nome.'), 'nome', 'ponto no fim é inválido no Windows');

const longo = 'x'.repeat(200);
ok(slugificar(longo).length <= 60, `título longo não foi cortado: ${slugificar(longo).length}`);
ok(!slugificar('a'.repeat(59) + ' bbb').endsWith('-'),
  'o corte deixou hífen solto na ponta');

for (const r of ['CON', 'nul', 'com1', 'LPT9', 'aux']) {
  ok(slugificar(r).startsWith('_'), `nome reservado do Windows não foi escapado: ${r}`);
}
igual(slugificar('console'), 'console', 'palavra que só começa como reservada ficou intacta');

const nome = montarNome('Resposta API', 'json', new Date(2026, 10, 18));
igual(nome, 'resposta-api_2026-11-18.json', 'nome completo');
igual(montarNome('', 'txt', new Date(2026, 0, 5)), 'selecao_2026-01-05.txt',
  'título vazio com data de janeiro');
igual(dataDeHoje(new Date(2026, 10, 18)), '2026-11-18', 'data local, não UTC');
console.log('  OK');

// ------------------------------------------------------------ decisão

console.log('\n== modo automático ==');
const auto = (t) => prepararExportacao(t, 'auto');
igual(auto('{"a":1}').extensao, 'json', 'JSON não foi reconhecido');
igual(auto('<a>1</a>').extensao, 'xml', 'XML não foi reconhecido');
igual(auto('só um texto').extensao, 'txt', 'texto comum deveria ser txt');
igual(auto('<p>a<br>b</p>').extensao, 'txt', 'HTML mal formado deveria cair para txt');
igual(auto('{a:1}').extensao, 'txt', 'JSON inválido deveria cair para txt');
ok(auto('qualquer coisa').atendido, 'automático nunca deveria sinalizar falha');
console.log('  OK json, depois xml, depois txt');

console.log('\n== tipo forçado ==');
const r1 = prepararExportacao('{"a":1}', 'json');
ok(r1.atendido && r1.extensao === 'json', 'json válido forçado como json');

const r2 = prepararExportacao('não sou json', 'json');
igual(r2.extensao, 'txt', 'json inválido forçado deveria sair txt');
ok(!r2.atendido, 'deveria sinalizar que o pedido não foi atendido');
igual(r2.pedido, 'json', 'deveria lembrar o que foi pedido');

const r3 = prepararExportacao('<p>a<br>b</p>', 'xml');
igual(r3.extensao, 'txt', 'xml inválido forçado deveria sair txt');
ok(!r3.atendido, 'deveria sinalizar');

const r4 = prepararExportacao('{"a":1}', 'txt');
igual(r4.extensao, 'txt', 'txt forçado sobre json deveria respeitar o pedido');
ok(r4.atendido, 'txt forçado sempre é atendido');
ok(r4.texto.includes('{"a":1}'), 'txt forçado não deveria reformatar o conteúdo');
console.log('  OK cai para txt e sinaliza, sem tentar consertar');

console.log('\n== a checagem extra de XML chega até o detectar ==');
ok(prepararExportacao('<a>1</a>', 'xml', { confirmarXML: () => false }).extensao === 'txt',
  'veto da checagem extra não chegou ao detectar');
ok(prepararExportacao('<a>1</a>', 'auto', { confirmarXML: () => false }).extensao === 'txt',
  'veto da checagem extra não chegou ao modo automático');
console.log('  OK');

// ------------------------------------- título hostil vira nome de arquivo

/*
 * O título da página é escrito por quem fez a página e vira o nome de um
 * arquivo no disco de quem instalou a extensão. Os casos abaixo saíram de
 * problemas que o Chromium já teve na própria determinação do nome de
 * download, ou de truques conhecidos de nome de arquivo.
 *
 * O Chrome também sanitiza. A defesa aqui não é redundante: a sanitização
 * dele é piso, já teve contorno publicado, e o nome sai daqui antes de
 * chegar lá.
 */
const pc = (n) => String.fromCodePoint(n);

console.log('\n== título hostil ==');

for (const [nome, titulo, proibido] of [
  ['barra invertida',          'pasta\u005Csub',        pc(0x5c)],
  ['barra normal',             'pasta/sub',             '/'],
  ['dois pontos',              'relatorio:final',       ':'],
  ['fluxo alternativo NTFS',   'nota.txt:oculto.exe',   ':'],
  ['porcentagem',              'usuario %USERNAME% x',  '%'],
  ['truque do .lnk.%%',        'arquivo.lnk.%%',        '%'],
  ['sobrescrita da direita',   'nota-exe' + pc(0x202e) + 'txt', pc(0x202e)],
  ['isolamento de direção',    'a' + pc(0x2066) + 'b' + pc(0x2069), pc(0x2066)],
  ['marca da esquerda',        'a' + pc(0x200e) + 'b',  pc(0x200e)],
]) {
  const s = slugificar(titulo);
  ok(!s.includes(proibido), `${nome}: sobrou no nome -> ${JSON.stringify(s)}`);
}
console.log('  OK nenhum caractere perigoso sobrevive');

// travessia de caminho: o nome não pode subir pasta nenhuma
for (const [nome, titulo] of [
  ['subir uma pasta',      '../segredo'],
  ['subir várias',         '../../../etc/passwd'],
  ['barra invertida dupla', '..\u005C..\u005CWindows\u005Csystem32'],
  ['caminho absoluto',     'C:\u005CWindows\u005CTemp\u005Cx'],
  ['raiz',                 '/etc/shadow'],
]) {
  const n = montarNome(titulo, 'txt');
  ok(!n.includes('/') && !n.includes(pc(0x5c)), `${nome}: criaria subpasta -> ${JSON.stringify(n)}`);
  ok(!n.startsWith('.'), `${nome}: nome começa com ponto -> ${JSON.stringify(n)}`);
}
console.log('  OK nenhum título sobe de pasta');

// a extensão final é sempre a que o detector decidiu, nunca a do título
for (const titulo of ['virus.exe', 'script.ps1', 'atalho.lnk', 'a.bat', 'x.scr']) {
  for (const ext of ['json', 'xml', 'txt']) {
    const n = montarNome(titulo, ext);
    ok(n.endsWith('.' + ext), `${titulo} como .${ext} saiu ${n}`);
    ok((n.match(/\.(exe|ps1|lnk|bat|scr)$/i) ?? []).length === 0,
      `${n} terminou com extensão executável`);
  }
}
console.log('  OK o título não escolhe a extensão');

// nome reservado do Windows, mesmo disfarçado
for (const t of ['CON', 'con', 'NUL', 'com1', 'LPT9', 'aux']) {
  ok(slugificar(t).startsWith('_'), `reservado ${t} passou sem prefixo`);
}
ok(!slugificar('console').startsWith('_'), 'console não é reservado e foi prefixado à toa');
console.log('  OK reservados do Windows');

// título que vira nada não pode gerar nome vazio nem oculto
for (const t of ['', '   ', '...', '///', '%%%', null, undefined, '-.-.-']) {
  const n = montarNome(t, 'txt');
  ok(n.startsWith('selecao_'), `título ${JSON.stringify(t)} virou ${JSON.stringify(n)}`);
}
console.log('  OK título vazio cai no nome padrão');

// o que NÃO pode ser removido: acento é legítimo em nome de arquivo
igual(slugificar('Relatório de Março'), 'relatório-de-março', 'acentuação foi perdida');
console.log('  OK acentuação preservada');

console.log(falhas === 0 ? '\nTUDO VERDE\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);

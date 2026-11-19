/**
 * O service worker rodando contra as APIs do Chrome simuladas.
 *
 * Os testes de núcleo cobrem "o conteúdo sai certo". Aqui o alvo é outro: a
 * ordem dos eventos e os caminhos de erro — dois gatilhos montando o menu ao
 * mesmo tempo, a injeção recusada por uma página protegida, dois cliques
 * disputando o documento offscreen, a URL do blob sendo revogada cedo demais.
 * Nada disso se reproduz clicando no navegador de forma confiável.
 *
 * Rodar: node tests/service-worker.test.mjs
 */
import { criarShim } from './shim-chrome.mjs';
import { montarNome } from '../src/core/nome.js';

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

/**
 * Carrega o service worker do zero.
 *
 * O módulo guarda estado no topo (a fila do menu, o guarda do offscreen, o
 * relógio do selo) e registra os ouvintes só na importação. Um cache de
 * módulo compartilhado faria um teste enxergar a sujeira do anterior, então
 * cada cenário importa a sua própria cópia.
 */
let versao = 0;
async function carregar(opcoes) {
  const kit = criarShim(opcoes);
  globalThis.chrome = kit.chrome;
  await import(`../src/background/service-worker.js?v=${++versao}`);
  return kit;
}

/** Deixa as promessas pendentes correrem antes de conferir o resultado. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

/**
 * O service worker registra as falhas esperadas em console.debug. Despejar
 * isso na saída esconderia uma falha de teste de verdade no meio do ruído, e
 * o que interessa é só que a mensagem existiu — então ela vira verificação.
 */
const registrado = [];
console.debug = (...args) => registrado.push(args.map(String).join(' '));

const JSON_API = '{"id":7,"nome":"Ana","ativo":true}';
const XML_NOTA = '<nota><para>Ana</para><corpo>oi</corpo></nota>';

// ------------------------------------------------------------------- menu

console.log('\n== montagem do menu ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();

  igual(registro.itensMenu.length, 5, 'menu deveria ter a raiz e os quatro modos');
  igual(registro.itensMenu[0].id, 'recorte-raiz', 'o primeiro item deveria ser a raiz');

  const ids = registro.itensMenu.slice(1).map((i) => i.id).join(',');
  igual(ids, 'recorte-auto,recorte-json,recorte-xml,recorte-txt', 'ordem dos modos');

  ok(registro.itensMenu.every((i) => i.contexts?.length === 1 && i.contexts[0] === 'selection'),
    'todo item deveria ser contexts: ["selection"] — sem seleção, sem menu');

  ok(registro.itensMenu.slice(1).every((i) => i.parentId === 'recorte-raiz'),
    'os modos deveriam pendurar na raiz');

  console.log('  OK cinco itens, só no contexto de seleção');
}

console.log('\n== instalar e iniciar ao mesmo tempo ==');
{
  // o bug real da extensão anterior: onInstalled e onStartup disparam quase
  // juntos, os dois fazem removeAll e os dois criam os mesmos ids
  const { registro, simular } = await carregar();
  await Promise.all([simular.instalar(), simular.iniciar()]);

  igual(registro.erros.length, 0, `o Chrome recusou ids repetidos: ${registro.erros[0] ?? ''}`);
  igual(registro.itensMenu.length, 5, 'sobrou menu duplicado ou faltando');
  console.log('  OK a fila serializa as duas montagens');
}

console.log('\n== remontar depois de já existir ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  await simular.iniciar();
  igual(registro.itensMenu.length, 5, 'a segunda montagem deveria substituir, não somar');
  igual(registro.erros.length, 0, 'remontar não deveria gerar erro');
  console.log('  OK');
}

// ----------------------------------------------------------------- clique

console.log('\n== clique no automático com JSON ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Minha API');
  await simular.clicar('auto', { selectionText: JSON_API, titulo: 'Minha API' });

  igual(registro.downloads.length, 1, 'deveria ter baixado um arquivo');
  igual(registro.downloads[0].filename, montarNome('Minha API', 'json'),
    'nome do arquivo veio do título da aba e da extensão decidida');
  igual(registro.downloads[0].saveAs, false, 'não deveria abrir a janela de salvar como');
  igual(registro.selos.length, 0, 'sem selo quando o pedido foi atendido');
  igual(registro.offscreenCriados, 1, 'o offscreen deveria ter sido criado sob demanda');
  console.log(`  OK ${registro.downloads[0].filename}`);
}

console.log('\n== clique no automático com XML ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(XML_NOTA, 'Nota');
  await simular.clicar('auto', { selectionText: XML_NOTA, titulo: 'Nota' });

  igual(registro.downloads[0]?.filename, montarNome('Nota', 'xml'), 'deveria ter saído .xml');
  console.log('  OK');
}

console.log('\n== clique no automático com texto comum ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('só um parágrafo qualquer', 'Blog');
  await simular.clicar('auto', { selectionText: 'só um parágrafo qualquer', titulo: 'Blog' });

  igual(registro.downloads[0]?.filename, montarNome('Blog', 'txt'), 'deveria ter saído .txt');
  igual(registro.selos.length, 0, 'texto comum no automático não é falha, não acende selo');
  console.log('  OK');
}

console.log('\n== .json forçado sobre conteúdo que não é JSON ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('isto não é json', 'Página');
  await simular.clicar('json', { selectionText: 'isto não é json' });

  igual(registro.downloads[0]?.filename, montarNome('Página', 'txt'),
    'pedido impossível deveria virar .txt, nunca um .json quebrado');
  igual(registro.selos[0], 'TXT', 'deveria avisar pelo selo que o tipo mudou');
  console.log('  OK vira .txt e avisa no ícone');
}

console.log('\n== .xml forçado sobre conteúdo que não é XML ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('xml', { selectionText: JSON_API });

  igual(registro.downloads[0]?.filename, montarNome('Página', 'txt'), 'deveria cair para .txt');
  igual(registro.selos[0], 'TXT', 'deveria avisar pelo selo');
  console.log('  OK');
}

console.log('\n== .txt forçado sobre JSON válido ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('txt', { selectionText: JSON_API });

  igual(registro.downloads[0]?.filename, montarNome('Página', 'txt'), 'o pedido manda');
  igual(registro.selos.length, 0, 'pedido atendido não acende selo');
  console.log('  OK');
}

// ------------------------------------------------------- caminhos de erro

console.log('\n== página que recusa injeção (chrome://, Web Store, PDF) ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('', 'Configurações', /* falhar */ true);
  registrado.length = 0;
  await simular.clicar('auto', { selectionText: 'texto visto pelo menu', titulo: 'Configurações' });

  igual(registro.downloads.length, 1,
    'com a injeção recusada, deveria exportar pelo info.selectionText');
  igual(registro.downloads[0].filename, montarNome('Configurações', 'txt'),
    'o título deveria vir da aba quando a página não responde');
  ok(registrado.some((l) => l.includes('Cannot access contents')),
    'a recusa deveria ser registrada, não engolida em silêncio');
  console.log('  OK falha sem quebrar, usando a reserva');
}

console.log('\n== injeção recusada e nada no info.selectionText ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('', 'Configurações', true);
  await simular.clicar('auto', { selectionText: '' });

  igual(registro.downloads.length, 0, 'sem texto não se baixa arquivo vazio');
  igual(registro.selos[0], '—', 'deveria sinalizar que não havia o que exportar');
  console.log('  OK');
}

console.log('\n== seleção só com espaço em branco ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('   \n\t  ', 'Página');
  await simular.clicar('auto', { selectionText: '   ' });

  igual(registro.downloads.length, 0, 'espaço em branco não é conteúdo');
  igual(registro.selos[0], '—', 'deveria sinalizar vazio');
  console.log('  OK');
}

console.log('\n== clique vindo de item que não é nosso ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('inexistente', { selectionText: JSON_API });

  igual(registro.downloads.length, 0, 'id desconhecido deveria ser ignorado em silêncio');
  igual(registro.offscreenCriados, 0, 'não deveria nem criar o offscreen');
  console.log('  OK');
}

console.log('\n== seleção dentro de um iframe ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Portal');
  await simular.clicar('auto', { selectionText: JSON_API, frameId: 42, abaId: 9 });

  igual(registro.execucoes[0]?.tabId, 9, 'deveria injetar na aba do clique');
  igual(registro.execucoes[0]?.frameIds?.[0], 42,
    'deveria injetar no frame do clique, não no topo — senão lê a seleção errada');
  console.log('  OK');
}

// ---------------------------------------------------------- offscreen/URL

console.log('\n== dois cliques quase juntos ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');

  await Promise.all([
    simular.clicar('auto', { selectionText: JSON_API }),
    simular.clicar('json', { selectionText: JSON_API }),
  ]);

  igual(registro.offscreenCriados, 1, 'só pode existir um documento offscreen');
  igual(registro.downloads.length, 2, 'os dois cliques deveriam ter gerado arquivo');
  console.log('  OK um offscreen, dois arquivos');
}

console.log('\n== a URL do blob só é revogada no fim do download ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('auto', { selectionText: JSON_API });

  igual(registro.urlsVivas.size, 1, 'revogar antes do fim cortaria o download');
  igual(registro.urlsRevogadas.length, 0, 'ainda não terminou');

  await simular.terminarDownload(1, 'complete');
  await esperar();

  igual(registro.urlsVivas.size, 0, 'a URL deveria ter sido liberada depois do fim');
  igual(registro.urlsRevogadas.length, 1, 'deveria ter revogado exatamente uma vez');
  console.log('  OK');
}

console.log('\n== download interrompido também libera a URL ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('auto', { selectionText: JSON_API });

  await simular.terminarDownload(1, 'interrupted');
  await esperar();

  igual(registro.urlsVivas.size, 0, 'cancelar o download deixaria o blob vazando na memória');
  console.log('  OK');
}

console.log('\n== o fim de um download não revoga a URL do outro ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.clicar('auto', { selectionText: JSON_API });
  await simular.clicar('auto', { selectionText: JSON_API });

  igual(registro.urlsVivas.size, 2, 'cada exportação tem a sua URL');

  await simular.terminarDownload(1, 'complete');
  await esperar();

  igual(registro.urlsVivas.size, 1, 'só a URL do download 1 deveria ter sido revogada');
  console.log('  OK');
}

// ------------------------------------------------------------- integração

console.log('\n== o conteúdo chega formatado do outro lado ==');
{
  // o shim roda o núcleo de verdade; isto confirma que o service worker
  // entrega a seleção crua, sem passar por info.selectionText
  const { chrome, registro, simular } = await carregar();
  await simular.instalar();

  const indentado = '{\n  "a": [\n    1\n  ]\n}';
  simular.definirPagina(indentado, 'Página');
  await simular.clicar('auto', { selectionText: '{ "a": [ 1 ] }' });

  igual(registro.downloads[0]?.filename, montarNome('Página', 'json'), 'deveria ser .json');

  const r = await chrome.runtime.sendMessage({
    destino: 'offscreen', tipo: 'EXPORTAR', texto: indentado, modo: 'auto',
  });
  igual(r.extensao, 'json', 'o mesmo texto pelo caminho direto deveria dar json');
  console.log('  OK');
}

// --------------------------------------------------- atalho de teclado

console.log('\n== atalho de teclado ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Minha API');
  await simular.atalho();

  igual(registro.downloads.length, 1, 'o atalho deveria exportar');
  igual(registro.downloads[0].filename, montarNome('Minha API', 'json'),
    'o atalho deveria usar o modo automático');
  igual(registro.selos.length, 0, 'sem selo quando deu certo');
  console.log(`  OK ${registro.downloads[0].filename}`);
}

console.log('\n== o atalho varre todos os frames ==');
{
  // é a diferença que justifica o código separado: pelo menu sabe-se o
  // frame do clique, pelo atalho não — e uma seleção dentro de iframe
  // ficaria invisível se só o topo fosse consultado
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('', 'Portal');          // topo sem seleção
  simular.definirFrame(1, JSON_API, 'Quadro');  // a seleção está no iframe
  await simular.atalho();

  igual(registro.execucoes[0]?.allFrames, true,
    'o atalho deveria injetar em todos os frames, não só no topo');
  igual(registro.downloads.length, 1, 'deveria achar a seleção dentro do iframe');
  igual(registro.downloads[0]?.filename, montarNome('Quadro', 'json'),
    'o título deveria vir do frame que tinha a seleção');
  console.log('  OK acha seleção em iframe');
}

console.log('\n== o menu continua mirando o frame do clique ==');
{
  // o atalho não pode ter contaminado o caminho do menu
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('', 'Portal');
  simular.definirFrame(7, JSON_API, 'Quadro');
  await simular.clicar('auto', { selectionText: JSON_API, frameId: 7, abaId: 3 });

  igual(registro.execucoes[0]?.allFrames, undefined, 'o menu não deveria varrer frames');
  igual(registro.execucoes[0]?.frameIds?.[0], 7, 'o menu deveria mirar o frame do clique');
  igual(registro.downloads.length, 1, 'o menu deveria ter exportado');
  console.log('  OK');
}

console.log('\n== atalho sem seleção nenhuma ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('   ', 'Página');
  await simular.atalho();

  igual(registro.downloads.length, 0, 'sem texto não se baixa arquivo');
  igual(registro.selos[0], '—', 'deveria sinalizar vazio');
  console.log('  OK');
}

console.log('\n== atalho numa página que recusa injeção ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina('', 'Configurações', /* falhar */ true);
  await simular.atalho();

  // sem clique não há info.selectionText de reserva: nada a fazer, mas
  // também nada que quebre
  igual(registro.downloads.length, 0, 'não há reserva para o atalho');
  igual(registro.selos[0], '—', 'deveria sinalizar vazio, não erro');
  console.log('  OK falha sem quebrar');
}

console.log('\n== comando desconhecido ==');
{
  const { registro, simular } = await carregar();
  await simular.instalar();
  simular.definirPagina(JSON_API, 'Página');
  await simular.atalho('outro-comando-qualquer');

  igual(registro.downloads.length, 0, 'comando alheio deveria ser ignorado');
  igual(registro.execucoes.length, 0, 'não deveria nem injetar');
  console.log('  OK');
}

console.log(falhas === 0 ? '\nTUDO VERDE\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);

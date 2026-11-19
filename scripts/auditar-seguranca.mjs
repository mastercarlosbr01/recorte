/**
 * Auditoria de segurança. Sai com código != 0 se o código contradisser as
 * promessas da loja.
 *
 * O público é desenvolvedor: ele abre o manifest e lê o fonte. Então a
 * garantia não pode ser "confia", tem que ser verificável — e verificada
 * automaticamente a cada mudança.
 *
 * Rodar: node scripts/auditar-seguranca.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let violacoes = 0;
let checagens = 0;

function falhar(regra, onde, detalhe) {
  violacoes++;
  console.error(`  ✗ ${regra}\n      ${onde}${detalhe ? `\n      ${detalhe}` : ''}`);
}

function passou(regra) {
  checagens++;
  console.log(`  ✓ ${regra}`);
}

// ------------------------------------------------------- coleta de fontes

function listarArquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (['node_modules', '.git', 'scripts', 'tests'].includes(nome)) continue;
      listarArquivos(caminho, acc);
    } else if (['.js', '.mjs', '.html'].includes(extname(nome))) {
      acc.push(caminho);
    }
  }
  return acc;
}

/** Remove comentários para não acusar falso positivo em texto explicativo. */
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FONTES = listarArquivos(join(RAIZ, 'src'));

// ------------------------------------------------------------- as regras

/** Padrões proibidos: [nome da regra, regex, por quê] */
const PROIBIDOS = [
  ['sem chamadas de rede', /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/,
    'o selo "100% local" exige que nenhum dado saia da máquina'],
  ['sem execução dinâmica de código', /\beval\s*\(|new\s+Function\s*\(/,
    'execução dinâmica é o vetor clássico de extensão comprometida'],
  ['sem injeção de HTML', /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/,
    'usar textContent/createElement fecha a porta de XSS na própria extensão'],
  ['sem URL remota embutida', /["'`]https?:\/\/(?!127\.0\.0\.1|localhost)/,
    'recurso remoto quebra a auditabilidade do pacote'],
  ['sem storage.sync', /storage\.sync/,
    'storage.sync replica dados nos servidores do Google'],
  ['sem mensageria nativa', /connectNative|sendNativeMessage/,
    'canal para binário fora do navegador'],
  ['sem cookies de terceiros', /chrome\.cookies/,
    'a extensão não tem motivo para ler cookies'],
];

console.log('\n== fonte ==');
for (const [regra, padrao, porque] of PROIBIDOS) {
  let achou = false;
  for (const arquivo of FONTES) {
    const conteudo = semComentarios(readFileSync(arquivo, 'utf8'));
    const linhas = conteudo.split('\n');
    linhas.forEach((linha, i) => {
      if (padrao.test(linha)) {
        achou = true;
        falhar(regra, `${relative(RAIZ, arquivo)}:${i + 1}`, `${linha.trim().slice(0, 90)}\n      motivo: ${porque}`);
      }
    });
  }
  if (!achou) passou(regra);
}

// -------------------------------------- o que o service worker não suporta

/**
 * Import dinâmico no service worker.
 *
 * A especificação de Service Workers proíbe `import()` depois da avaliação
 * inicial, e o Chrome responde com
 *   TypeError: import() is disallowed on ServiceWorkerGlobalScope
 * derrubando a operação inteira. No Node isso é perfeitamente legal, então
 * nenhum teste pega — esta regra existe porque o defeito já aconteceu uma
 * vez e custou caro de achar.
 *
 * Vale só para o worker e para o que ele importa. O documento offscreen é
 * uma página normal, onde import dinâmico é permitido.
 */
const SEM_IMPORT_DINAMICO = [
  join(RAIZ, 'src', 'background'),
  join(RAIZ, 'src', 'core'),
];

const DINAMICO = /(^|[^.\w$])import\s*\(/;
let achouDinamico = false;

for (const dir of SEM_IMPORT_DINAMICO) {
  if (!existsSync(dir)) continue;
  for (const arquivo of listarArquivos(dir)) {
    semComentarios(readFileSync(arquivo, 'utf8')).split('\n').forEach((linha, i) => {
      if (!DINAMICO.test(linha)) return;
      achouDinamico = true;
      falhar('sem import() dinâmico no service worker', `${relative(RAIZ, arquivo)}:${i + 1}`,
        `${linha.trim().slice(0, 90)}\n      motivo: o Chrome lança TypeError; use import estático no topo`);
    });
  }
}
if (!achouDinamico) passou('sem import() dinâmico no service worker (o Chrome proíbe)');

// ---------------------------------------------------------------- manifest

console.log('\n== manifest ==');
const manifesto = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));

const PERMISSOES_PERMITIDAS = new Set(['contextMenus', 'activeTab', 'scripting', 'downloads', 'offscreen']);
const extras = (manifesto.permissions ?? []).filter((p) => !PERMISSOES_PERMITIDAS.has(p));
if (extras.length) falhar('só permissões da lista curta', 'manifest.json', `sobrando: ${extras.join(', ')}`);
else passou(`só permissões da lista curta (${(manifesto.permissions ?? []).join(', ')})`);

if (manifesto.host_permissions?.length) {
  falhar('sem host_permissions', 'manifest.json', JSON.stringify(manifesto.host_permissions));
} else {
  passou('sem host_permissions (activeTab só age no clique do usuário)');
}

if (manifesto.content_scripts?.length) {
  falhar('sem content_script estático', 'manifest.json',
    'rodaria em toda página desde a instalação; aqui a injeção é sob demanda');
} else {
  passou('sem content_script estático (injeção só no clique, via activeTab)');
}

/**
 * O invariante do Recorte: nenhuma permissão de host, nem fixa nem opcional.
 *
 * A extensão alcança a página apenas por `activeTab`, que o Chrome concede no
 * clique do usuário e só para aquela aba. Declarar host permission — mesmo
 * opcional — abriria a porta para a extensão agir sem o clique, e é o que a
 * descrição promete que não acontece.
 */
if (manifesto.optional_host_permissions?.length) {
  falhar('sem optional_host_permissions', 'manifest.json',
    JSON.stringify(manifesto.optional_host_permissions));
} else {
  passou('sem optional_host_permissions (só activeTab, no clique)');
}

const csp = manifesto.content_security_policy?.extension_pages ?? '';
for (const exigido of ["script-src 'self'", "connect-src 'none'", "object-src 'none'"]) {
  if (csp.includes(exigido)) passou(`CSP tem ${exigido}`);
  else falhar('CSP incompleta', 'manifest.json', `falta: ${exigido}`);
}

if (manifesto.web_accessible_resources?.length) {
  falhar('sem web_accessible_resources', 'manifest.json',
    'expõe arquivos da extensão para qualquer página ler');
} else {
  passou('sem web_accessible_resources');
}

// ------------------------------------------------------------- _locales

/**
 * Limites da Chrome Web Store. Estourar só aparece no upload, depois de
 * empacotar e arrastar o zip — barato demais para descobrir tarde.
 */
console.log('\n== textos da loja ==');
const LIMITES = { extName: 75, extDescription: 132 };
const pastaLocales = join(RAIZ, '_locales');

if (!existsSync(pastaLocales)) {
  falhar('_locales existe', 'manifest.json', 'default_locale sem a pasta');
} else {
  for (const idioma of readdirSync(pastaLocales)) {
    const arquivo = join(pastaLocales, idioma, 'messages.json');
    if (!existsSync(arquivo)) {
      falhar('messages.json presente', `_locales/${idioma}`, 'arquivo ausente');
      continue;
    }
    const msgs = JSON.parse(readFileSync(arquivo, 'utf8'));
    for (const [chave, limite] of Object.entries(LIMITES)) {
      const texto = msgs[chave]?.message;
      if (texto === undefined) {
        falhar(`${chave} definido`, `_locales/${idioma}/messages.json`, 'chave ausente');
      } else if (texto.length > limite) {
        falhar(`${chave} dentro do limite`, `_locales/${idioma}/messages.json`,
          `${texto.length} caracteres, o máximo é ${limite}`);
      } else {
        passou(`${idioma}/${chave}: ${texto.length}/${limite} caracteres`);
      }
    }
  }
}

// ------------------------------------------------------------- resultado

console.log(
  violacoes === 0
    ? `\nAUDITORIA OK — ${checagens} verificações, 0 violações\n`
    : `\nAUDITORIA REPROVADA — ${violacoes} violação(ões)\n`
);
process.exit(violacoes === 0 ? 0 : 1);

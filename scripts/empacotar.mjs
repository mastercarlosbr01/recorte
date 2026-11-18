/**
 * Monta o .zip para subir na Chrome Web Store.
 *
 * Só entra o que a extensão usa em execução. Teste, script de build, CSV de
 * origem e documentação ficam de fora: reduzem o pacote e diminuem a
 * superfície que o revisor da loja precisa auditar.
 *
 * Roda a verificação antes; se teste ou auditoria falhar, não empacota.
 *
 * Rodar: node scripts/empacotar.mjs
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, mkdirSync, rmSync, existsSync,
  readFileSync, statSync, readdirSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

/** O que vai para a loja. Tudo o mais fica fora por padrão. */
const INCLUIR = [
  'manifest.json',
  'assets',
  '_locales',
  'src',
];

/**
 * Cópia recursiva à mão.
 *
 * `fs.cpSync` derruba o processo sem erro nesta máquina (Node 24 + caminho com
 * acento e espaço, que vira `\\?\...`). readdir + copyFile não tem esse
 * problema e ainda deixa explícito o que entra no pacote.
 */
function copiar(origem, destino) {
  if (statSync(origem).isDirectory()) {
    mkdirSync(destino, { recursive: true });
    for (const nome of readdirSync(origem)) {
      copiar(join(origem, nome), join(destino, nome));
    }
  } else {
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origem, destino);
  }
}

const manifesto = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));
const versao = manifesto.version;
const nomeZip = `recorte-${versao}.zip`;

// ------------------------------------------------- portões de qualidade

console.log('== verificação ==');
for (const script of ['tests/json.test.mjs', 'tests/xml.test.mjs',
                      'tests/txt-nome-detectar.test.mjs',
                      'tests/service-worker.test.mjs',
                      'scripts/auditar-seguranca.mjs']) {
  try {
    execFileSync(process.execPath, [join(RAIZ, script)], { cwd: RAIZ, stdio: 'pipe' });
    console.log(`  ✓ ${script}`);
  } catch (erro) {
    console.error(`  ✗ ${script} FALHOU — pacote não gerado`);
    console.error(erro.stdout?.toString() ?? erro.message);
    process.exit(1);
  }
}

// ------------------------------------------------------------- staging

console.log('\n== staging ==');
rmSync(DIST, { recursive: true, force: true });
const palco = join(DIST, 'recorte');
mkdirSync(palco, { recursive: true });

for (const item of INCLUIR) {
  const origem = join(RAIZ, item);
  if (!existsSync(origem)) {
    console.error(`  ✗ faltando: ${item}`);
    process.exit(1);
  }
  copiar(origem, join(palco, item));
  console.log(`  + ${item}`);
}

function medir(dir) {
  let bytes = 0;
  let arquivos = 0;
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      const sub = medir(caminho);
      bytes += sub.bytes;
      arquivos += sub.arquivos;
    } else {
      bytes += info.size;
      arquivos++;
    }
  }
  return { bytes, arquivos };
}

const { bytes, arquivos } = medir(palco);
console.log(`  ${arquivos} arquivos, ${(bytes / 1024).toFixed(1)} KB`);

// ----------------------------------------------------------------- zip

console.log('\n== zip ==');
const destino = join(DIST, nomeZip);
try {
  execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path "${join(palco, '*')}" -DestinationPath "${destino}" -Force`,
  ], { stdio: 'pipe' });
} catch (erro) {
  console.error('  ✗ Compress-Archive falhou:', erro.message);
  console.error(`  compacte manualmente o CONTEÚDO de ${palco}`);
  process.exit(1);
}

const tamanho = statSync(destino).size;
console.log(`  ${relative(RAIZ, destino)} — ${(tamanho / 1024).toFixed(1)} KB`);
console.log('\nPronto para subir em https://chrome.google.com/webstore/devconsole\n');

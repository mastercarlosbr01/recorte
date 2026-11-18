/**
 * Ícones provisórios, desenhados na grade de pixels.
 *
 * São marcas de recorte: dois cantos em L opostos, como os que delimitam uma
 * área a ser cortada, com um traço ciano no meio. A forma foi escolhida por
 * sobreviver a 16px — nessa escala não cabe desenho, só silhueta.
 *
 * Trocar por arte de verdade antes de publicar.
 *
 * Rodar: node scripts/gerar-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'assets');

const NAVY = [15, 23, 42, 255];
const CLARO = [230, 237, 246, 255];
const CIANO = [6, 182, 212, 255];
const VAZIO = [0, 0, 0, 0];

// ------------------------------------------------------------- PNG cru

const TABELA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(tipo, dados) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function png(lado, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const linhas = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 4);
    for (let x = 0; x < lado; x++) linha.set(pixels[y][x], 1 + x * 4);
    linhas.push(linha);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- desenho

function desenhar(lado) {
  const u = lado / 16;
  const px = (n) => Math.round(n * u);
  const esp = Math.max(1, Math.round(u)); // espessura do traço

  const tela = Array.from({ length: lado }, () =>
    Array.from({ length: lado }, () => VAZIO.slice())
  );

  const pintar = (x0, y0, x1, y1, cor) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (x >= 0 && x < lado && y >= 0 && y < lado) tela[y][x] = cor.slice();
  };

  // fundo com cantos cortados, sem antialias: borda suave a 16px vira cinza
  const r = px(3);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const dx = Math.min(x, lado - 1 - x);
      const dy = Math.min(y, lado - 1 - y);
      const dentro = dx >= r || dy >= r || (r - dx) ** 2 + (r - dy) ** 2 <= r * r;
      tela[y][x] = dentro ? NAVY.slice() : VAZIO.slice();
    }
  }

  const m = px(4);        // margem dos cantos
  const braco = px(4);    // comprimento de cada braço do L

  // canto superior esquerdo
  pintar(m, m, m + braco, m + esp, CLARO);
  pintar(m, m, m + esp, m + braco, CLARO);

  // canto inferior direito
  const f = lado - m;
  pintar(f - braco, f - esp, f, f, CLARO);
  pintar(f - esp, f - braco, f, f, CLARO);

  // traço ciano na diagonal central, a marca da extensão
  pintar(px(6), px(7), px(10), px(9), CIANO);

  return tela;
}

mkdirSync(DESTINO, { recursive: true });
for (const lado of [16, 32, 48, 128]) {
  writeFileSync(join(DESTINO, `icone-${lado}.png`), png(lado, desenhar(lado)));
  console.log(`  assets/icone-${lado}.png`);
}
console.log('\n  provisórios — trocar por arte antes de publicar');

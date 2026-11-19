/**
 * Ícones da extensão.
 *
 * O desenho: uma página com o canto cortado e três linhas de texto, a do
 * meio em ciano. É a frase da extensão em forma — "a seleção virou
 * arquivo". A silhueta de documento foi escolhida por ser a forma mais
 * reconhecível que existe a 16px, onde não cabe desenho, só contorno.
 *
 * Duas alternativas foram desenhadas e descartadas: um bloco de seleção
 * com alças, que lia como balão de conversa e perdia as alças abaixo de
 * 32px, e marcas de recorte, bonitas e abstratas demais — dizem "cortar",
 * não dizem "arquivo".
 *
 * As formas são descritas em coordenadas de 0 a 1, então a mesma descrição
 * serve para 16 e para 512 sem reescrever nada. E cada pixel de saída
 * amostra 8x8 pontos dentro de si, virando a cobertura em transparência:
 * sem isso a borda arredondada vira degrau e o traço fino some justamente
 * no tamanho que mais importa.
 *
 * Rodar: node scripts/gerar-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'assets');

const NAVY = [15, 23, 42];
const CLARO = [230, 237, 246];
const CIANO = [6, 182, 212];

const TAMANHOS = [16, 32, 48, 128];
const AMOSTRAS = 8;

// --------------------------------------------------------------- PNG cru

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
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA

  const linhas = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 4); // o byte 0 é o filtro "nenhum"
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

// ------------------------------------------------------------ formas 0..1

/**
 * Retângulo de cantos arredondados.
 *
 * Ordena as coordenadas antes de usar: uma versão anterior aceitava só
 * x0 < x1, e qualquer forma descrita de trás para frente simplesmente não
 * aparecia — sem erro, sem aviso, só ausente no desenho.
 */
function retangulo(ax, ay, bx, by, r = 0) {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (r <= 0) return true;
    const dx = Math.min(x - x0, x1 - x);
    const dy = Math.min(y - y0, y1 - y);
    if (dx >= r || dy >= r) return true;
    return (r - dx) ** 2 + (r - dy) ** 2 <= r * r;
  };
}

/** Triângulo, pelo sinal do produto vetorial nos três lados. */
function triangulo(ax, ay, bx, by, cx, cy) {
  return (x, y) => {
    const s = (px, py, qx, qy) => (qx - px) * (y - py) - (qy - py) * (x - px);
    const d1 = s(ax, ay, bx, by);
    const d2 = s(bx, by, cx, cy);
    const d3 = s(cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
}

const menos = (a, b) => (x, y) => a(x, y) && !b(x, y);

// ----------------------------------------------------------------- desenho

/** A página, com o canto superior direito cortado. */
const pagina = menos(
  retangulo(0.26, 0.17, 0.74, 0.83, 0.05),
  triangulo(0.60, 0.13, 0.78, 0.13, 0.78, 0.33)
);

const CAMADAS = [
  { cor: NAVY, forma: retangulo(0.02, 0.02, 0.98, 0.98, 0.22) },
  { cor: CLARO, forma: pagina },
  { cor: NAVY, forma: retangulo(0.345, 0.40, 0.655, 0.445) },
  // a linha destacada é mais grossa que as outras: é ela que carrega a ideia
  { cor: CIANO, forma: retangulo(0.345, 0.50, 0.655, 0.575) },
  { cor: NAVY, forma: retangulo(0.345, 0.635, 0.56, 0.68) },
];

function desenhar(lado) {
  const tela = Array.from({ length: lado }, () =>
    Array.from({ length: lado }, () => [0, 0, 0, 0])
  );

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const destino = tela[y][x];

      for (const { cor, forma } of CAMADAS) {
        let dentro = 0;
        for (let sy = 0; sy < AMOSTRAS; sy++) {
          for (let sx = 0; sx < AMOSTRAS; sx++) {
            const px = (x + (sx + 0.5) / AMOSTRAS) / lado;
            const py = (y + (sy + 0.5) / AMOSTRAS) / lado;
            if (forma(px, py)) dentro++;
          }
        }
        if (dentro === 0) continue;

        const a = dentro / (AMOSTRAS * AMOSTRAS);
        const aDestino = destino[3] / 255;
        const aFinal = a + aDestino * (1 - a);
        for (let i = 0; i < 3; i++) {
          destino[i] = Math.round((cor[i] * a + destino[i] * aDestino * (1 - a)) / aFinal);
        }
        destino[3] = Math.round(aFinal * 255);
      }
    }
  }

  return tela;
}

mkdirSync(DESTINO, { recursive: true });
for (const lado of TAMANHOS) {
  const arquivo = join(DESTINO, `icone-${lado}.png`);
  writeFileSync(arquivo, png(lado, desenhar(lado)));
  console.log(`  assets/icone-${lado}.png`);
}
console.log('\n  confira o de 16 em tamanho real: se você não distingue o que é,');
console.log('  o ícone não serve, por melhor que esteja a 128.');

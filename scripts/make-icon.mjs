// Génère build/icon.png (256 × 256) sans dépendance : un encodeur PNG minimal sur zlib.
// electron-builder en dérive l'icône .ico de l'installeur et de l'exécutable.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const pixels = new Uint8Array(SIZE * SIZE * 4)

function put(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}

function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, color)
}

function fillRoundedRect(x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const cx = Math.max(x0 + radius, Math.min(x, x0 + w - 1 - radius))
      const cy = Math.max(y0 + radius, Math.min(y, y0 + h - 1 - radius))
      if (Math.hypot(x - cx, y - cy) <= radius) put(x, y, color)
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (Math.hypot(x - cx, y - cy) <= radius) put(x, y, color)
    }
  }
}

/** Trait horizontal ou vertical d'épaisseur donnée, bouts ronds. */
function thickLine(x1, y1, x2, y2, thickness, color) {
  const half = thickness / 2
  if (y1 === y2) fillRect(Math.min(x1, x2), y1 - half, Math.abs(x2 - x1), thickness, color)
  else fillRect(x1 - half, Math.min(y1, y2), thickness, Math.abs(y2 - y1), color)
  fillCircle(x1, y1, half, color)
  fillCircle(x2, y2, half, color)
}

const NAVY = [36, 41, 47]
const GRID = [64, 72, 82]
const WHITE = [255, 255, 255]
const AMBER = [255, 196, 61]
const BLUE = [84, 174, 255]

// Fond arrondi et grille de points.
fillRoundedRect(0, 0, SIZE, SIZE, 48, NAVY)
for (let y = 32; y < SIZE; y += 32) for (let x = 32; x < SIZE; x += 32) fillCircle(x, y, 3, GRID)

// Un composant (boîte claire) avec deux broches, relié par un fil ambre à un fil bleu : T.
fillRoundedRect(40, 88, 72, 80, 10, WHITE)
fillCircle(40, 112, 7, BLUE)
fillCircle(112, 144, 7, BLUE)
thickLine(112, 144, 176, 144, 14, AMBER)
thickLine(176, 144, 176, 72, 14, AMBER)
thickLine(176, 72, 224, 72, 14, AMBER)
thickLine(176, 144, 176, 216, 14, BLUE)
thickLine(176, 216, 224, 216, 14, BLUE)
fillCircle(176, 144, 16, AMBER)

// Encodage PNG : signature, IHDR, IDAT (filtre 0 par ligne), IEND.
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // profondeur
header[9] = 6 // RGBA
header[10] = 0
header[11] = 0
header[12] = 0

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`Icône écrite : ${out} (${png.length} octets)`)

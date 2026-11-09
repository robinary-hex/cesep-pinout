// Génère build/icon.png (256 × 256, fond transparent) sans dépendance : un encodeur PNG minimal
// sur zlib. electron-builder en dérive l'icône .ico de l'installeur et de l'exécutable.
// Dessin : une puce sarcelle à huit pattes marquée d'un P blanc, repère de la broche 1 en coin.
// Les formes sont décrites dans un repère de 64 unités, rendues 16 fois plus grandes puis
// réduites par moyenne (anticrénelage), pour rester nettes de 16 à 256 px.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const OVERSAMPLE = 4
const UNITS = 64
const RENDER = SIZE * OVERSAMPLE
const K = RENDER / UNITS
const big = new Float32Array(RENDER * RENDER * 4)

function put(x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= RENDER || y >= RENDER) return
  const i = (y * RENDER + x) * 4
  big[i] = r
  big[i + 1] = g
  big[i + 2] = b
  big[i + 3] = 255
}

/** Remplit les pixels du rendu dont le centre (en unités) satisfait `inside`. */
function fill(x0, y0, x1, y1, color, inside) {
  const px0 = Math.max(0, Math.floor(x0 * K))
  const py0 = Math.max(0, Math.floor(y0 * K))
  const px1 = Math.min(RENDER - 1, Math.ceil(x1 * K))
  const py1 = Math.min(RENDER - 1, Math.ceil(y1 * K))
  for (let py = py0; py <= py1; py++) {
    const y = (py + 0.5) / K
    for (let px = px0; px <= px1; px++) {
      if (inside((px + 0.5) / K, y)) put(px, py, color)
    }
  }
}

function roundedRect(x, y, w, h, radius, color) {
  fill(x, y, x + w, y + h, color, (u, v) => {
    const cx = Math.max(x + radius, Math.min(u, x + w - radius))
    const cy = Math.max(y + radius, Math.min(v, y + h - radius))
    return Math.hypot(u - cx, v - cy) <= radius
  })
}

function circle(cx, cy, radius, color) {
  fill(
    cx - radius,
    cy - radius,
    cx + radius,
    cy + radius,
    color,
    (u, v) => Math.hypot(u - cx, v - cy) <= radius
  )
}

/** Trait horizontal ou vertical à bouts ronds. */
function line(x1, y1, x2, y2, thickness, color) {
  const half = thickness / 2
  if (y1 === y2)
    roundedRect(
      Math.min(x1, x2) - half,
      y1 - half,
      Math.abs(x2 - x1) + thickness,
      thickness,
      half,
      color
    )
  else
    roundedRect(
      x1 - half,
      Math.min(y1, y2) - half,
      thickness,
      Math.abs(y2 - y1) + thickness,
      half,
      color
    )
}

/** Demi-anneau droit (de −90° à +90°), centre et rayon donnés, épaisseur du trait. */
function rightArc(cx, cy, radius, thickness, color) {
  const inner = radius - thickness / 2
  const outer = radius + thickness / 2
  fill(cx, cy - outer, cx + outer, cy + outer, color, (u, v) => {
    const d = Math.hypot(u - cx, v - cy)
    return u >= cx && d >= inner && d <= outer
  })
}

const TEAL = [15, 118, 110]
const TEAL_DARK = [9, 84, 78]
const METAL = [176, 183, 191]
const WHITE = [255, 255, 255]

// Pattes : quatre de chaque côté, débordant du corps.
for (const cy of [15, 26, 37, 48]) {
  roundedRect(4, cy - 2.2, 8, 4.4, 1.2, METAL)
  roundedRect(52, cy - 2.2, 8, 4.4, 1.2, METAL)
}
// Corps de la puce et repère de la broche 1.
roundedRect(11, 7, 42, 50, 5, TEAL)
circle(17, 13, 2, TEAL_DARK)
// Le P : jambage, barre, boucle, retour.
const STROKE = 6
line(24, 19, 24, 45, STROKE, WHITE)
line(24, 19, 34, 19, STROKE, WHITE)
rightArc(34, 26.5, 7.5, STROKE, WHITE)
line(34, 34, 24, 34, STROKE, WHITE)
// Les bouts ronds de la boucle dépassent la barre : on les recouvre proprement.
circle(34, 19, STROKE / 2, WHITE)
circle(34, 34, STROKE / 2, WHITE)

// Réduction par moyenne des blocs OVERSAMPLE × OVERSAMPLE (alpha prémultiplié).
const pixels = new Uint8Array(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let dy = 0; dy < OVERSAMPLE; dy++) {
      for (let dx = 0; dx < OVERSAMPLE; dx++) {
        const i = ((y * OVERSAMPLE + dy) * RENDER + x * OVERSAMPLE + dx) * 4
        const alpha = big[i + 3] / 255
        r += big[i] * alpha
        g += big[i + 1] * alpha
        b += big[i + 2] * alpha
        a += alpha
      }
    }
    const o = (y * SIZE + x) * 4
    if (a > 0) {
      pixels[o] = Math.round(r / a)
      pixels[o + 1] = Math.round(g / a)
      pixels[o + 2] = Math.round(b / a)
      pixels[o + 3] = Math.round((a / (OVERSAMPLE * OVERSAMPLE)) * 255)
    }
  }
}

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

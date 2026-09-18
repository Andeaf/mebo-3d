// Generates build/icon.ico: a brand-neutral placeholder glyph (a two-door
// cabinet with a light worktop on a rounded slate tile), rendered at 16, 24,
// 32, 48, 64, 128 and 256 px as uncompressed 32-bit BMP (DIB) entries, the
// icon format every Windows version, NSIS and rcedit accept.
//
// Node only, no dependencies. `npm run icon` regenerates the file; the output
// is committed so `npm run dist` never depends on this script. A real logo
// replaces build/icon.ico and this script becomes history.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZES = [16, 24, 32, 48, 64, 128, 256]
/** Rendered at SUPERSAMPLE × the target size, then box-filtered down. */
const SUPERSAMPLE = 4
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.ico')

const SLATE = [0x2b, 0x32, 0x3c]
const SLATE_DARK = [0x1c, 0x21, 0x28]
const LIGHT = [0xe6, 0xe9, 0xec]
const OAK = [0xd9, 0xa8, 0x66]
const OAK_DARK = [0xb3, 0x84, 0x48]

/** Rounded rectangles in unit coordinates (0..1, y down), painted in order. */
const SHAPES = [
  { x: 0, y: 0, w: 1, h: 1, r: 0.2, color: SLATE }, // tile
  { x: 0.14, y: 0.24, w: 0.72, h: 0.09, r: 0.02, color: LIGHT }, // worktop
  { x: 0.18, y: 0.33, w: 0.64, h: 0.5, r: 0, color: OAK_DARK }, // carcass
  { x: 0.2, y: 0.35, w: 0.29, h: 0.44, r: 0.015, color: OAK }, // left door
  { x: 0.51, y: 0.35, w: 0.29, h: 0.44, r: 0.015, color: OAK }, // right door
  { x: 0.435, y: 0.5, w: 0.03, h: 0.12, r: 0.015, color: SLATE_DARK }, // handles
  { x: 0.535, y: 0.5, w: 0.03, h: 0.12, r: 0.015, color: SLATE_DARK },
  { x: 0.2, y: 0.83, w: 0.6, h: 0.05, r: 0, color: SLATE_DARK } // plinth
]

/** Signed distance from a point to the edge of a rounded rectangle (negative inside). */
function roundedRectDistance(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const dx = Math.abs(px - cx) - ((x1 - x0) / 2 - r)
  const dy = Math.abs(py - cy) - ((y1 - y0) / 2 - r)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside - r
}

/** Straight-alpha RGBA (0..1) at `size` × `size`, painter's order, 1 px antialiasing at the supersampled resolution. */
function render(size) {
  const s = size * SUPERSAMPLE
  const high = new Float32Array(s * s * 4)
  for (const shape of SHAPES) {
    const x0 = shape.x * s
    const y0 = shape.y * s
    const x1 = (shape.x + shape.w) * s
    const y1 = (shape.y + shape.h) * s
    const r = shape.r * s
    const [sr, sg, sb] = shape.color.map((c) => c / 255)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = roundedRectDistance(x + 0.5, y + 0.5, x0, y0, x1, y1, r)
        const a = Math.min(1, Math.max(0, 0.5 - d))
        if (a === 0) {
          continue
        }
        const i = (y * s + x) * 4
        const da = high[i + 3]
        const na = a + da * (1 - a)
        high[i] = (sr * a + high[i] * da * (1 - a)) / na
        high[i + 1] = (sg * a + high[i + 1] * da * (1 - a)) / na
        high[i + 2] = (sb * a + high[i + 2] * da * (1 - a)) / na
        high[i + 3] = na
      }
    }
  }
  // Box filter on premultiplied colour, then un-premultiply.
  const low = new Float32Array(size * size * 4)
  const n = SUPERSAMPLE * SUPERSAMPLE
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const i = ((y * SUPERSAMPLE + sy) * s + x * SUPERSAMPLE + sx) * 4
          const pa = high[i + 3]
          r += high[i] * pa
          g += high[i + 1] * pa
          b += high[i + 2] * pa
          a += pa
        }
      }
      const o = (y * size + x) * 4
      low[o + 3] = a / n
      if (a > 0) {
        low[o] = r / a
        low[o + 1] = g / a
        low[o + 2] = b / a
      }
    }
  }
  return low
}

/** One ICO image entry: BITMAPINFOHEADER + bottom-up BGRA rows + the 1-bit AND mask. */
function dibEntry(size, rgba) {
  const xorBytes = size * size * 4
  const maskStride = Math.ceil(size / 32) * 4
  const maskBytes = maskStride * size
  const buffer = Buffer.alloc(40 + xorBytes + maskBytes)
  buffer.writeUInt32LE(40, 0) // biSize
  buffer.writeInt32LE(size, 4) // biWidth
  buffer.writeInt32LE(size * 2, 8) // biHeight: XOR + AND
  buffer.writeUInt16LE(1, 12) // biPlanes
  buffer.writeUInt16LE(32, 14) // biBitCount
  buffer.writeUInt32LE(0, 16) // BI_RGB
  buffer.writeUInt32LE(xorBytes + maskBytes, 20) // biSizeImage
  let offset = 40
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      buffer[offset++] = Math.round(rgba[i + 2] * 255)
      buffer[offset++] = Math.round(rgba[i + 1] * 255)
      buffer[offset++] = Math.round(rgba[i] * 255)
      buffer[offset++] = Math.round(rgba[i + 3] * 255)
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    const row = offset
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] === 0) {
        buffer[row + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    offset += maskStride
  }
  return buffer
}

function writeIco(sizes) {
  const entries = sizes.map((size) => ({ size, data: dibEntry(size, render(size)) }))
  const header = Buffer.alloc(6 + 16 * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // icon
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach(({ size, data }, index) => {
    const at = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, at)
    header.writeUInt8(size === 256 ? 0 : size, at + 1)
    header.writeUInt8(0, at + 2) // palette
    header.writeUInt8(0, at + 3)
    header.writeUInt16LE(1, at + 4) // planes
    header.writeUInt16LE(32, at + 6) // bits per pixel
    header.writeUInt32LE(data.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...entries.map((entry) => entry.data)])
}

mkdirSync(dirname(OUTPUT), { recursive: true })
const ico = writeIco(SIZES)
writeFileSync(OUTPUT, ico)
console.log(`wrote ${OUTPUT} (${ico.length} bytes, ${SIZES.join('/')} px)`)

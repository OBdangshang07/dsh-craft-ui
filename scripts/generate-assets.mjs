import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets', 'generated')
await mkdir(out, { recursive: true })

const table = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c >>> 0
}

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function image(width, height, painter) {
  const pixels = Buffer.alloc(width * height * 4)
  const api = {
    pixel(x, y, color) {
      if (x < 0 || y < 0 || x >= width || y >= height) return
      const i = (y * width + x) * 4
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = color[3] ?? 255
    },
    rect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.pixel(xx, yy, color)
    },
    line(x0, y0, x1, y1, color) {
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
      let err = dx + dy
      while (true) {
        this.pixel(x0, y0, color)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 >= dy) { err += dy; x0 += sx }
        if (e2 <= dx) { err += dx; y0 += sy }
      }
    },
  }
  painter(api)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

function bevel(width, height, palette) {
  return image(width, height, p => {
    p.rect(0, 0, width, height, palette.edge)
    p.rect(1, 1, width - 2, height - 2, palette.dark)
    p.rect(2, 2, width - 4, height - 4, palette.fill)
    p.rect(2, 2, width - 4, 1, palette.light)
    p.rect(2, 2, 1, height - 4, palette.light)
    p.rect(2, height - 3, width - 4, 1, palette.shadow)
    p.rect(width - 3, 2, 1, height - 4, palette.shadow)
    for (let y = 4; y < height - 3; y += 4) for (let x = 4 + (y % 3); x < width - 3; x += 7) p.pixel(x, y, palette.noise)
  })
}

const palettes = {
  normal: { edge: [20, 22, 20], dark: [53, 57, 53], fill: [101, 106, 99], light: [157, 164, 153], shadow: [42, 45, 42], noise: [91, 96, 90] },
  hover: { edge: [18, 25, 15], dark: [48, 75, 38], fill: [91, 139, 66], light: [158, 207, 124], shadow: [31, 55, 25], noise: [78, 126, 56] },
  pressed: { edge: [16, 18, 16], dark: [91, 95, 89], fill: [70, 74, 69], light: [45, 48, 45], shadow: [131, 137, 127], noise: [62, 66, 61] },
  panel: { edge: [44, 43, 39], dark: [105, 103, 96], fill: [198, 196, 186], light: [239, 236, 224], shadow: [92, 89, 82], noise: [186, 183, 173] },
  tooltip: { edge: [25, 4, 44], dark: [77, 31, 105], fill: [20, 8, 29], light: [126, 64, 164], shadow: [9, 2, 16], noise: [29, 12, 41] },
}

const outputs = {
  'button-normal.png': bevel(24, 20, palettes.normal),
  'button-hover.png': bevel(24, 20, palettes.hover),
  'button-pressed.png': bevel(24, 20, palettes.pressed),
  'panel.png': bevel(24, 24, palettes.panel),
  'tooltip.png': bevel(16, 16, palettes.tooltip),
  'stone.png': texture(32, [[117, 121, 113], [92, 97, 91], [139, 143, 134]], 7),
  'deepslate.png': texture(32, [[42, 48, 45], [27, 32, 30], [58, 64, 60]], 19),
  'planks.png': planks(),
  'parchment.png': texture(32, [[222, 209, 161], [197, 179, 128], [239, 225, 180]], 41),
  'icons.png': icons(),
}

for (const [name, bytes] of Object.entries(outputs)) await writeFile(join(out, name), bytes)

const manifest = {
  version: 2,
  license: 'MIT',
  generated: true,
  sprites: {
    'button.normal': { file: 'button-normal.png', size: [24, 20], scaleType: 'nine_slice', border: [6, 6, 6, 6] },
    'button.hover': { file: 'button-hover.png', size: [24, 20], scaleType: 'nine_slice', border: [6, 6, 6, 6] },
    'button.pressed': { file: 'button-pressed.png', size: [24, 20], scaleType: 'nine_slice', border: [6, 6, 6, 6] },
    panel: { file: 'panel.png', size: [24, 24], scaleType: 'nine_slice', border: [6, 6, 6, 6] },
    tooltip: { file: 'tooltip.png', size: [16, 16], scaleType: 'nine_slice', border: [4, 4, 4, 4] },
    icons: { file: 'icons.png', size: [144, 16], scaleType: 'fixed', cell: [16, 16] },
  },
  textures: ['stone.png', 'deepslate.png', 'planks.png', 'parchment.png'],
  fonts: {
    ui: {
      file: '../fonts/fusion-pixel-10px-monospaced-zh-hans.woff2',
      family: 'Craft Pixel',
      format: 'woff2',
      language: 'zh-Hans',
      license: 'OFL-1.1',
      licenseFile: '../fonts/OFL.txt',
      componentLicenseFiles: [
        '../fonts/LICENSES/ark-pixel/OFL.txt',
        '../fonts/LICENSES/boutique-bitmap-9x9/OFL.txt',
        '../fonts/LICENSES/galmuri/LICENSE.txt',
      ],
    },
  },
}
await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`generated ${Object.keys(outputs).length} original pixel assets in ${out}`)

function texture(size, colors, seed) {
  return image(size, size, p => {
    p.rect(0, 0, size, size, colors[0])
    let n = seed >>> 0
    for (let i = 0; i < size * 2; i += 1) {
      n = (n * 1664525 + 1013904223) >>> 0
      const x = n % size, y = (n >>> 8) % size
      p.rect(x, y, 1 + ((n >>> 16) & 1), 1 + ((n >>> 18) & 1), colors[1 + ((n >>> 20) & 1)])
    }
  })
}

function planks() {
  return image(32, 32, p => {
    p.rect(0, 0, 32, 32, [139, 96, 54])
    for (let y = 0; y < 32; y += 8) {
      p.rect(0, y, 32, 1, [75, 47, 27])
      const offset = (y / 8 % 2) * 11
      p.rect(offset, y, 1, 8, [91, 58, 32])
      p.rect((offset + 17) % 32, y, 1, 8, [91, 58, 32])
      p.line(3, y + 3, 12, y + 3, [176, 126, 71])
    }
  })
}

function icons() {
  return image(144, 16, p => {
    const at = index => ({
      pixel: (x, y, c) => p.pixel(index * 16 + x, y, c),
      rect: (x, y, w, h, c) => p.rect(index * 16 + x, y, w, h, c),
      line: (x0, y0, x1, y1, c) => p.line(index * 16 + x0, y0, index * 16 + x1, y1, c),
    })
    let q = at(0); q.line(4, 14, 10, 5, [123, 83, 45]); q.line(5, 3, 13, 6, [185, 190, 184]); q.line(5, 4, 12, 7, [96, 101, 96])
    q = at(1); q.rect(3, 2, 10, 12, [103, 54, 31]); q.rect(5, 3, 7, 10, [229, 213, 157]); q.line(8, 3, 8, 13, [163, 135, 88])
    q = at(2); q.line(3, 13, 12, 3, [206, 213, 210]); q.line(5, 14, 13, 6, [118, 126, 122]); q.rect(2, 11, 6, 2, [121, 79, 40])
    q = at(3); q.rect(3, 3, 10, 10, [80, 84, 81]); q.rect(4, 4, 8, 8, [214, 207, 170]); q.line(8, 8, 11, 4, [205, 53, 44]); q.pixel(8, 8, [35, 38, 36])
    q = at(4); q.rect(2, 4, 12, 10, [132, 82, 35]); q.rect(2, 7, 12, 2, [67, 40, 20]); q.rect(7, 7, 3, 4, [231, 197, 83])
    q = at(5); q.line(8, 1, 13, 7, [97, 224, 124]); q.line(8, 1, 3, 7, [45, 153, 76]); q.line(3, 7, 8, 15, [29, 111, 54]); q.line(13, 7, 8, 15, [53, 184, 89]); q.rect(6, 6, 4, 5, [115, 238, 139])
    q = at(6); q.rect(6, 2, 4, 12, [111, 15, 18]); q.rect(2, 6, 12, 4, [149, 24, 26]); q.rect(6, 6, 4, 4, [232, 62, 55])
    q = at(7); q.rect(3, 5, 10, 8, [71, 146, 161]); q.rect(5, 2, 6, 3, [112, 205, 216]); q.rect(5, 9, 2, 4, [25, 70, 81]); q.rect(9, 9, 2, 4, [25, 70, 81])
    q = at(8); q.rect(2, 2, 12, 12, [118, 72, 34]); q.rect(4, 4, 8, 8, [169, 111, 57]); q.line(4, 8, 12, 8, [79, 44, 24]); q.line(8, 4, 8, 12, [79, 44, 24]); q.rect(6, 6, 4, 4, [214, 157, 82])
  })
}

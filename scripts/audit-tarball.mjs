import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'fflate'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const fontSha256 = '26f51314318daa30553e33979d6f1dae977dbe127d25ba14c654ac4c27e0b6f7'
const archivePath = process.argv[2] ? resolve(process.argv[2]) : join(root, '.generated', 'packs', `${pkg.name}-${pkg.version}.tgz`)
const tar = gunzipSync(await readFile(archivePath))
const files = new Map()
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512)
  if (header.every(byte => byte === 0)) break
  const name = textField(header, 0, 100)
  const prefix = textField(header, 345, 155)
  const path = prefix ? `${prefix}/${name}` : name
  const size = Number.parseInt(textField(header, 124, 12).trim() || '0', 8)
  const type = String.fromCharCode(header[156] || 48)
  if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid tar size for ${path}`)
  if (type !== '0' && type !== '5') throw new Error(`Non-regular tar entry rejected: ${path} (type ${type})`)
  if (type === '0') files.set(path, tar.subarray(offset + 512, offset + 512 + size))
  offset += 512 + Math.ceil(size / 512) * 512
}

const allowed = new Set([
  'package/LICENSE', 'package/README.md', 'package/README.zh-CN.md', 'package/THIRD_PARTY_NOTICES.md', 'package/cordis.patch.yml', 'package/package.json',
  'package/docs/ASSET_POLICY.md', 'package/docs/COMPATIBILITY.md', 'package/docs/RELEASE_CHECKLIST.md',
  'package/lib/index.js', 'package/lib/client.js', 'package/lib/client-gameplay.js', 'package/lib/client-hotbar.js',
  'package/assets/fonts/fusion-pixel-10px-monospaced-zh-hans.woff2', 'package/assets/fonts/OFL.txt',
  'package/assets/fonts/LICENSES/ark-pixel/OFL.txt', 'package/assets/fonts/LICENSES/boutique-bitmap-9x9/OFL.txt',
  'package/assets/fonts/LICENSES/galmuri/LICENSE.txt',
  ...['button-hover.png', 'button-normal.png', 'button-pressed.png', 'deepslate.png', 'icons.png', 'manifest.json', 'panel.png', 'parchment.png', 'planks.png', 'stone.png', 'tooltip.png'].map(name => `package/assets/generated/${name}`),
])
for (const path of files.keys()) {
  if (!allowed.has(path)) throw new Error(`Unexpected packaged file: ${path}`)
  if (/\.(?:jar|zip|ogg|ttf|otf|woff|mcmeta)$/i.test(path) || /(?:resource-packs|\.generated|node_modules)/i.test(path)) throw new Error(`Forbidden packaged asset: ${path}`)
}
for (const path of allowed) if (!files.has(path)) throw new Error(`Missing packaged file: ${path}`)
const packagedFont = files.get('package/assets/fonts/fusion-pixel-10px-monospaced-zh-hans.woff2')
if (sha256(packagedFont) !== fontSha256) throw new Error('Packaged font hash does not match the reviewed Fusion Pixel release')
const clientSource = new TextDecoder().decode(files.get('package/lib/client.js'))
const embeddedFonts = [...clientSource.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)]
if (embeddedFonts.length !== 1 || sha256(Buffer.from(embeddedFonts[0][1], 'base64')) !== fontSha256) throw new Error('Client must contain exactly the reviewed bundled font')
const decoded = new TextDecoder().decode(tar).replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, 'data:font/woff2;base64,[reviewed-font]')
if (/base64,[A-Za-z0-9+/]{10000}/.test(decoded)) throw new Error('Large embedded binary found in tarball text')
console.log(`tarball audit passed: ${files.size} allowlisted files, reviewed bundled font, no imported assets`)

function textField(bytes, start, length) {
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0.*$/s, '')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

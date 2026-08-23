import { createHash } from 'node:crypto'
import { access, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const fontFile = 'assets/fonts/fusion-pixel-10px-monospaced-zh-hans.woff2'
const fontSha256 = '26f51314318daa30553e33979d6f1dae977dbe127d25ba14c654ac4c27e0b6f7'
const required = [
  'lib/index.js', 'lib/client.js', 'lib/client-gameplay.js', 'lib/client-hotbar.js', 'assets/generated/manifest.json',
  fontFile, 'assets/fonts/OFL.txt', 'assets/fonts/LICENSES/ark-pixel/OFL.txt',
  'assets/fonts/LICENSES/boutique-bitmap-9x9/OFL.txt', 'assets/fonts/LICENSES/galmuri/LICENSE.txt',
  'cordis.patch.yml', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
]
for (const file of required) await access(join(root, file))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
if (pkg.name !== 'dsh-craft-ui') throw new Error('Unexpected package name')
if (!pkg.dsh?.client || !pkg.dsh?.bundle) throw new Error('Package must declare both dsh.client and dsh.bundle')
const client = await stat(join(root, 'lib', 'client.js'))
if (client.size > 900_000) throw new Error(`Client bundle exceeds 900KB budget: ${client.size}`)
const clientSource = await readFile(join(root, 'lib', 'client.js'), 'utf8')
const embeddedFonts = [...clientSource.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)]
if (embeddedFonts.length !== 1) throw new Error(`Expected exactly one embedded WOFF2 font, found ${embeddedFonts.length}`)
const font = await readFile(join(root, fontFile))
if (sha256(font) !== fontSha256) throw new Error('Bundled font hash does not match the reviewed Fusion Pixel release')
if (sha256(Buffer.from(embeddedFonts[0][1], 'base64')) !== fontSha256) throw new Error('Embedded client font differs from the packaged font')
if (/__ASSET_[A-Z_]+__/.test(clientSource)) throw new Error('Client contains an unresolved bundled asset placeholder')
const trackedText = await Promise.all(['README.md', 'THIRD_PARTY_NOTICES.md', 'package.json'].map(file => readFile(join(root, file), 'utf8')))
if (trackedText.some(text => /base64,[A-Za-z0-9+/]{10000}/.test(text))) throw new Error('Large embedded binary found in tracked text')
console.log(`package contract verified; client=${client.size} bytes`)

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

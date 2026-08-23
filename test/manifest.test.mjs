import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('asset manifest declares fixed sprites, nine-slice sprites, and the bundled font', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'assets/generated/manifest.json'), 'utf8'))
  assert.equal(manifest.version, 2)
  assert.equal(manifest.sprites.panel.scaleType, 'nine_slice')
  assert.deepEqual(manifest.sprites.panel.border, [6, 6, 6, 6])
  assert.equal(manifest.sprites.icons.scaleType, 'fixed')
  assert.equal(manifest.fonts.ui.file, '../fonts/fusion-pixel-10px-monospaced-zh-hans.woff2')
  assert.equal(manifest.fonts.ui.license, 'OFL-1.1')
  assert.equal(manifest.fonts.ui.componentLicenseFiles.length, 3)
})

test('distributed manifest distinguishes original art from the licensed font', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'assets/generated/manifest.json'), 'utf8'))
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.generated, true)
  assert.equal(manifest.fonts.ui.family, 'Craft Pixel')
})

test('theme and motion overrides are scoped to the enabled plugin state', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  assert.match(css, /body\.craft-ui-enabled\[data-craft-theme="craft-day"\]/)
  assert.match(css, /body\.craft-ui-enabled\[data-craft-theme="craft-deepslate"\]/)
  assert.match(css, /body\.craft-ui-enabled\[data-craft-motion="off"\] \*/)
  assert.doesNotMatch(css, /(?<!craft-ui-enabled)\[data-craft-theme="craft-(?:day|deepslate)"\]/)
})

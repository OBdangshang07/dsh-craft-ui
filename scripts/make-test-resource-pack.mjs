import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const root = resolve(import.meta.dirname, '..')
const output = join(root, '.generated', 'test-resource-pack.zip')
await mkdir(join(root, '.generated'), { recursive: true })
const button = await readFile(join(root, 'assets', 'generated', 'button-normal.png'))
const hover = await readFile(join(root, 'assets', 'generated', 'button-hover.png'))
const scaling = strToU8(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 24, height: 20, border: 6 } } }))
await writeFile(output, zipSync({
  'pack.mcmeta': strToU8(JSON.stringify({ pack: { pack_format: 34, description: 'Craft UI end-to-end fixture' } })),
  'assets/minecraft/textures/gui/sprites/widget/button.png': button,
  'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta': scaling,
  'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png': hover,
  'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png.mcmeta': scaling,
  'assets/minecraft/lang/zh_cn.json': strToU8('{"excluded":true}'),
}))
console.log(output)

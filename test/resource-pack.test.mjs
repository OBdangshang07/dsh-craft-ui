import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import {
  clearResourcePackCache,
  importLocalItemDirectory,
  importResourcePack,
  readResourcePackStatus,
  readResourceTheme,
} from '../lib/index.js'

async function fixture(entries) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-craft-ui-test-'))
  const archive = join(base, 'pack.zip')
  await writeFile(archive, zipSync(entries, { level: 1 }))
  return { base, archive, root: join(base, 'craft-ui', 'resource-packs') }
}

test('imports only whitelisted Minecraft GUI resources and records capabilities', async () => {
  const setup = await fixture({
    'pack.mcmeta': strToU8(JSON.stringify({ pack: { pack_format: 34, description: 'Test pack' } })),
    'assets/minecraft/textures/gui/sprites/widget/button.png': new Uint8Array([137, 80, 78, 71]),
    'assets/minecraft/textures/gui/container/inventory.png': new Uint8Array([137, 80, 78, 71]),
    'assets/minecraft/font/default.json': strToU8('{}'),
    'assets/minecraft/sounds/ui/button.ogg': strToU8('OggS'),
    'assets/minecraft/lang/en_us.json': strToU8('{"must":"not extract"}'),
  })
  const status = await importResourcePack(setup.archive, setup.root)
  assert.equal(status.active, true)
  assert.equal(status.files, 5)
  assert.equal(status.packFormat, 34)
  assert.deepEqual(status.capabilities, {
    modernSprites: true,
    legacyWidgets: false,
    containers: true,
    fonts: true,
    sounds: true,
    items: false,
  })
  const pack = join(setup.root, status.hash)
  assert.equal((await stat(join(pack, 'assets/minecraft/textures/gui/container/inventory.png'))).isFile(), true)
  await assert.rejects(readFile(join(pack, 'assets/minecraft/lang/en_us.json')))
  assert.equal((await readResourcePackStatus(setup.root)).sourceName, 'pack.zip')
  const theme = await readResourceTheme(setup.root)
  assert.equal(theme.active, true)
  assert.match(theme.assets['button.normal'].dataUrl, /^data:image\/png;base64,/)
  assert.equal(theme.assets.inventory.source, 'assets/minecraft/textures/gui/container/inventory.png')
  assert.equal((await clearResourcePackCache(setup.root)).active, false)
  await assert.rejects(stat(setup.root))
})

test('imports only semantic item sprites from a loose local textures directory', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-craft-ui-items-'))
  const textures = join(base, 'textures')
  const items = join(textures, 'items')
  const root = join(base, 'cache', 'craft-ui', 'resource-packs')
  await mkdir(items, { recursive: true })
  const png = new Uint8Array(24)
  png.set([0x89, 0x50, 0x4e, 0x47], 0)
  png.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(png.buffer).setUint32(16, 16)
  new DataView(png.buffer).setUint32(20, 16)
  await writeFile(join(items, 'diamond_pickaxe.png'), png)
  await writeFile(join(items, 'nether_star.png'), png)
  await writeFile(join(items, 'unrelated_mod_item.png'), png)
  const status = await importLocalItemDirectory(textures, root)
  assert.equal(status.files, 2)
  assert.equal(status.capabilities.items, true)
  assert.equal(status.capabilities.modernSprites, false)
  const theme = await readResourceTheme(root)
  assert.equal(theme.assets['item.pickaxe'].source, 'assets/minecraft/textures/item/diamond_pickaxe.png')
  assert.equal(theme.assets['item.star'].source, 'assets/minecraft/textures/item/nether_star.png')
  assert.equal(theme.assets['item.unrelated'], undefined)
  await importLocalItemDirectory(textures, root)
  assert.doesNotMatch(await readFile(join(root, status.hash, 'craft-ui-manifest.json'), 'utf8'), /sourcePath/)
  assert.doesNotMatch(await readFile(join(root, 'active.json'), 'utf8'), /sourcePath/)
})

test('rejects relative item paths and malformed item dimensions', async () => {
  await assert.rejects(importLocalItemDirectory('textures/items', join(tmpdir(), 'craft-ui', 'resource-packs')), /绝对路径/)
  const base = await mkdtemp(join(tmpdir(), 'dsh-craft-ui-bad-item-'))
  const items = join(base, 'items')
  await mkdir(items, { recursive: true })
  const png = new Uint8Array(24)
  png.set([0x89, 0x50, 0x4e, 0x47], 0)
  png.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(png.buffer).setUint32(16, 16)
  new DataView(png.buffer).setUint32(20, 32)
  await writeFile(join(items, 'diamond_pickaxe.png'), png)
  await assert.rejects(importLocalItemDirectory(items, join(base, 'cache', 'craft-ui', 'resource-packs')), /正方形二次幂/)
})

test('parses modern nine-slice metadata and maps legacy widgets coordinates', async () => {
  const modern = await fixture({
    'assets/minecraft/textures/gui/sprites/widget/button.png': new Uint8Array([137, 80, 78, 71]),
    'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta': strToU8(JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: { left: 3, top: 4, right: 5, bottom: 6 }, stretch_inner: false } } })),
  })
  await importResourcePack(modern.archive, modern.root)
  const modernButton = (await readResourceTheme(modern.root)).assets['button.normal']
  assert.deepEqual(modernButton.slice, [4, 5, 6, 3])
  assert.equal(modernButton.repeat, 'repeat')

  const legacy = await fixture({ 'assets/minecraft/textures/gui/widgets.png': new Uint8Array([137, 80, 78, 71]) })
  await importResourcePack(legacy.archive, legacy.root)
  const assets = (await readResourceTheme(legacy.root)).assets
  assert.deepEqual(assets.hotbar.rect, [0, 0, 182, 22])
  assert.deepEqual(assets['button.hover'].rect, [0, 86, 200, 20])
})

test('rejects non archives and ZIP path traversal before writing cache', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-craft-ui-test-'))
  const fake = join(base, 'pack.txt')
  await writeFile(fake, 'not a zip')
  await assert.rejects(importResourcePack(fake, join(base, 'craft-ui', 'resource-packs')), /仅支持/)

  const traversal = await fixture({
    '../evil.png': strToU8('evil'),
    'assets/minecraft/textures/gui/widgets.png': new Uint8Array([137, 80, 78, 71]),
  })
  await assert.rejects(importResourcePack(traversal.archive, traversal.root), /路径穿越|不安全路径/)
  await assert.rejects(stat(join(traversal.base, 'evil.png')))
})

test('rejects oversized allowed entries and unsafe cache targets', async () => {
  const setup = await fixture({
    'assets/minecraft/textures/gui/huge.png': new Uint8Array(8 * 1024 * 1024 + 1),
  })
  await assert.rejects(importResourcePack(setup.archive, setup.root), /超过 8 MB/)
  await assert.rejects(clearResourcePackCache(join(setup.base, 'resource-packs')), /拒绝清理/)
})

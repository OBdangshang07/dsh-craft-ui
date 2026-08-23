import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { unzipSync, type UnzipFileInfo } from 'fflate'

export const ARCHIVE_LIMIT = 256 * 1024 * 1024
export const ENTRY_LIMIT = 8 * 1024 * 1024
export const EXTRACTED_LIMIT = 40 * 1024 * 1024
export const ENTRY_COUNT_LIMIT = 3000

export interface ResourcePackStatus {
  active: boolean
  hash?: string
  sourceName?: string
  importedAt?: string
  files: number
  bytes: number
  packFormat?: number
  description?: string
  capabilities: {
    modernSprites: boolean
    legacyWidgets: boolean
    containers: boolean
    fonts: boolean
    sounds: boolean
    items: boolean
  }
}

export interface ResourceThemeAsset {
  dataUrl: string
  source: string
  slice?: [number, number, number, number]
  repeat?: 'stretch' | 'repeat'
  rect?: [number, number, number, number]
}

export interface ResourceTheme {
  active: boolean
  sourceName?: string
  assets: Record<string, ResourceThemeAsset>
}

interface StoredResourcePack extends ResourcePackStatus {}

const EMPTY_STATUS: ResourcePackStatus = {
  active: false,
  files: 0,
  bytes: 0,
  capabilities: {
    modernSprites: false,
    legacyWidgets: false,
    containers: false,
    fonts: false,
    sounds: false,
    items: false,
  },
}

export function resolveResourcePackRoot(dshHome?: string): string {
  const home = dshHome?.trim() || process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return resolve(home, 'craft-ui', 'resource-packs')
}

export async function readResourcePackStatus(root: string): Promise<ResourcePackStatus> {
  try {
    const row = JSON.parse(await readFile(join(root, 'active.json'), 'utf8')) as StoredResourcePack
    if (!row.hash || !/^[a-f0-9]{64}$/.test(row.hash)) return EMPTY_STATUS
    const packDir = resolve(root, row.hash)
    assertInside(root, packDir)
    const info = await stat(packDir)
    return info.isDirectory() ? publicStatus(row) : EMPTY_STATUS
  } catch {
    return EMPTY_STATUS
  }
}

export async function importResourcePack(archivePath: string, root: string): Promise<ResourcePackStatus> {
  if (typeof archivePath !== 'string' || archivePath.trim() === '') throw new Error('请选择 Minecraft JAR 或资源包 ZIP')
  if (!isAbsolute(archivePath.trim())) throw new Error('资源包必须使用绝对路径')
  const source = resolve(archivePath.trim())
  const sourceInfo = await stat(source)
  if (!sourceInfo.isFile()) throw new Error('所选路径不是文件')
  if (sourceInfo.size > ARCHIVE_LIMIT) throw new Error('压缩包超过 256 MB 安全上限')
  if (!/\.(jar|zip)$/i.test(source)) throw new Error('仅支持 .jar 或 .zip 文件')

  const archive = await readFile(source)
  if (archive.length < 4 || archive[0] !== 0x50 || archive[1] !== 0x4b) throw new Error('文件不是有效的 ZIP/JAR 压缩包')
  const hash = createHash('sha256').update(archive).digest('hex')
  let total = 0
  let count = 0
  const accepted = new Set<string>()
  const extracted = unzipSync(archive, {
    filter(info: UnzipFileInfo) {
      const name = validateArchivePath(info.name)
      count += 1
      if (count > ENTRY_COUNT_LIMIT) throw new Error('资源包条目超过 3000 个安全上限')
      if (!isAllowedResource(name)) return false
      if (info.originalSize > ENTRY_LIMIT) throw new Error(`资源条目超过 8 MB：${name}`)
      total += info.originalSize
      if (total > EXTRACTED_LIMIT) throw new Error('允许提取的资源总量超过 40 MB')
      accepted.add(name)
      return true
    },
  })
  if (accepted.size === 0) throw new Error('资源包中没有可用的 Minecraft GUI 素材')

  await mkdir(root, { recursive: true })
  const destination = resolve(root, hash)
  assertInside(root, destination)
  const staging = resolve(root, `.import-${hash}-${randomUUID()}`)
  assertInside(root, staging)
  await mkdir(staging, { recursive: true })
  try {
    for (const [rawName, bytes] of Object.entries(extracted)) {
      const name = validateArchivePath(rawName)
      if (!accepted.has(name)) continue
      const target = resolve(staging, ...name.split('/'))
      assertInside(staging, target)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }
    const packMeta = parsePackMeta(extracted['pack.mcmeta'])
    const names = [...accepted]
    const stored: StoredResourcePack = {
      active: true,
      hash,
      sourceName: basename(source),
      importedAt: new Date().toISOString(),
      files: accepted.size,
      bytes: total,
      ...packMeta,
      capabilities: {
        modernSprites: names.some(name => name.startsWith('assets/minecraft/textures/gui/sprites/')),
        legacyWidgets: names.includes('assets/minecraft/textures/gui/widgets.png'),
        containers: names.some(name => name.startsWith('assets/minecraft/textures/gui/container/')),
        fonts: names.some(name => name.startsWith('assets/minecraft/font/')),
        sounds: names.some(name => name.endsWith('.ogg')),
        items: names.some(name => name.startsWith('assets/minecraft/textures/item/')),
      },
    }
    await writeFile(join(staging, 'craft-ui-manifest.json'), `${JSON.stringify(stored, null, 2)}\n`)
    try {
      await rename(staging, destination)
    } catch (error) {
      const existing = await stat(destination).catch(() => undefined)
      if (!existing?.isDirectory()) throw error
      await rm(staging, { recursive: true, force: true })
    }
    await writeFile(join(destination, 'craft-ui-manifest.json'), `${JSON.stringify(stored, null, 2)}\n`)
    await writeFile(join(root, 'active.json'), `${JSON.stringify(stored, null, 2)}\n`)
    return publicStatus(stored)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

const LOCAL_ITEM_FILES = [
  'diamond_pickaxe', 'diamond_axe', 'diamond_sword', 'book_writable', 'compass_item',
  'emerald', 'redstone_dust', 'diamond_helmet', 'nether_star', 'ender_eye', 'paper',
  'clock_item', 'experience_bottle', 'armor_stand', 'totem', 'map_filled', 'hopper',
  'minecart_command_block',
] as const

/** Imports only a fixed set of item sprites from a user-owned loose textures directory. */
export async function importLocalItemDirectory(directoryPath: string, root: string): Promise<ResourcePackStatus> {
  if (typeof directoryPath !== 'string' || directoryPath.trim() === '') throw new Error('请选择 Minecraft textures 或 items 目录')
  if (!isAbsolute(directoryPath.trim())) throw new Error('物品贴图目录必须使用绝对路径')
  const source = resolve(directoryPath.trim())
  const sourceInfo = await stat(source)
  if (!sourceInfo.isDirectory()) throw new Error('所选路径不是目录')
  const itemDirectory = await resolveItemDirectory(source)
  const selected: Array<{ name: string, bytes: Buffer }> = []
  for (const name of LOCAL_ITEM_FILES) {
    const target = resolve(itemDirectory, `${name}.png`)
    assertInside(itemDirectory, target)
    const actual = await realpath(target).catch(() => undefined)
    if (!actual) continue
    assertInside(itemDirectory, actual)
    const targetInfo = await stat(actual)
    if (!targetInfo.isFile()) continue
    const bytes = await readFile(actual)
    if (!bytes) continue
    if (bytes.length > 64 * 1024) throw new Error(`物品贴图超过 64 KB：${name}.png`)
    assertPng(bytes, name)
    selected.push({ name, bytes })
  }
  if (selected.length === 0) throw new Error('目录中没有识别到可用的原版物品贴图')
  const digest = createHash('sha256')
  for (const item of selected) digest.update(item.name).update(item.bytes)
  const hash = digest.digest('hex')
  const total = selected.reduce((sum, item) => sum + item.bytes.length, 0)
  await mkdir(root, { recursive: true })
  const destination = resolve(root, hash)
  const staging = resolve(root, `.import-${hash}-${randomUUID()}`)
  assertInside(root, destination)
  assertInside(root, staging)
  await mkdir(staging, { recursive: true })
  try {
    const canonical = join(staging, 'assets', 'minecraft', 'textures', 'item')
    await mkdir(canonical, { recursive: true })
    for (const item of selected) await writeFile(join(canonical, `${item.name}.png`), item.bytes)
    const stored: StoredResourcePack = {
      active: true,
      hash,
      sourceName: basename(itemDirectory),
      importedAt: new Date().toISOString(),
      files: selected.length,
      bytes: total,
      description: 'Local item sprites only',
      capabilities: { modernSprites: false, legacyWidgets: false, containers: false, fonts: false, sounds: false, items: true },
    }
    await writeFile(join(staging, 'craft-ui-manifest.json'), `${JSON.stringify(stored, null, 2)}\n`)
    try {
      await rename(staging, destination)
    } catch (error) {
      const existing = await stat(destination).catch(() => undefined)
      if (!existing?.isDirectory()) throw error
      await rm(staging, { recursive: true, force: true })
    }
    await writeFile(join(destination, 'craft-ui-manifest.json'), `${JSON.stringify(stored, null, 2)}\n`)
    await writeFile(join(root, 'active.json'), `${JSON.stringify(stored, null, 2)}\n`)
    return publicStatus(stored)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

export async function clearResourcePackCache(root: string): Promise<ResourcePackStatus> {
  const target = resolve(root)
  if (basename(target) !== 'resource-packs' || basename(dirname(target)) !== 'craft-ui') {
    throw new Error('拒绝清理非 Craft UI 资源缓存目录')
  }
  await rm(target, { recursive: true, force: true })
  return EMPTY_STATUS
}

const SEMANTIC_CANDIDATES: Record<string, readonly string[]> = {
  'button.normal': ['assets/minecraft/textures/gui/sprites/widget/button.png'],
  'button.hover': ['assets/minecraft/textures/gui/sprites/widget/button_highlighted.png'],
  'button.disabled': ['assets/minecraft/textures/gui/sprites/widget/button_disabled.png'],
  hotbar: ['assets/minecraft/textures/gui/sprites/hud/hotbar.png'],
  'hotbar.selection': ['assets/minecraft/textures/gui/sprites/hud/hotbar_selection.png'],
  'xp.background': ['assets/minecraft/textures/gui/sprites/hud/experience_bar_background.png'],
  'xp.progress': ['assets/minecraft/textures/gui/sprites/hud/experience_bar_progress.png'],
  inventory: [
    'assets/minecraft/textures/gui/container/inventory.png',
    'assets/minecraft/textures/gui/container/generic_54.png',
  ],
  'item.pickaxe': ['assets/minecraft/textures/item/diamond_pickaxe.png'],
  'item.axe': ['assets/minecraft/textures/item/diamond_axe.png'],
  'item.sword': ['assets/minecraft/textures/item/diamond_sword.png'],
  'item.book': ['assets/minecraft/textures/item/book_writable.png', 'assets/minecraft/textures/item/writable_book.png'],
  'item.compass': ['assets/minecraft/textures/item/compass_item.png', 'assets/minecraft/textures/item/compass_16.png'],
  'item.emerald': ['assets/minecraft/textures/item/emerald.png'],
  'item.redstone': ['assets/minecraft/textures/item/redstone_dust.png', 'assets/minecraft/textures/item/redstone.png'],
  'item.helmet': ['assets/minecraft/textures/item/diamond_helmet.png'],
  'item.star': ['assets/minecraft/textures/item/nether_star.png'],
  'item.eye': ['assets/minecraft/textures/item/ender_eye.png'],
  'item.paper': ['assets/minecraft/textures/item/paper.png'],
  'item.clock': ['assets/minecraft/textures/item/clock_item.png', 'assets/minecraft/textures/item/clock_00.png'],
  'item.xp': ['assets/minecraft/textures/item/experience_bottle.png'],
  'item.agent': ['assets/minecraft/textures/item/armor_stand.png'],
  'item.totem': ['assets/minecraft/textures/item/totem.png', 'assets/minecraft/textures/item/totem_of_undying.png'],
  'item.map': ['assets/minecraft/textures/item/map_filled.png', 'assets/minecraft/textures/item/filled_map.png'],
  'item.hopper': ['assets/minecraft/textures/item/hopper.png'],
  'item.command': ['assets/minecraft/textures/item/minecart_command_block.png', 'assets/minecraft/textures/item/command_block_minecart.png'],
}

/** Reads only a small semantic subset into the loopback browser, never the archive or its path. */
export async function readResourceTheme(root: string): Promise<ResourceTheme> {
  const status = await readResourcePackStatus(root)
  if (!status.active || !status.hash) return { active: false, assets: {} }
  const pack = resolve(root, status.hash)
  assertInside(root, pack)
  const assets: Record<string, ResourceThemeAsset> = {}
  let total = 0
  for (const [semantic, candidates] of Object.entries(SEMANTIC_CANDIDATES)) {
    for (const relative of candidates) {
      const target = resolve(pack, ...relative.split('/'))
      assertInside(pack, target)
      const bytes = await readFile(target).catch(() => undefined)
      if (!bytes || bytes.length > 2 * 1024 * 1024 || total + bytes.length > 8 * 1024 * 1024) continue
      total += bytes.length
      const scaling = await readGuiScaling(`${target}.mcmeta`)
      assets[semantic] = {
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        source: relative,
        ...scaling,
      }
      break
    }
  }
  const legacyPath = resolve(pack, 'assets', 'minecraft', 'textures', 'gui', 'widgets.png')
  const legacy = await readFile(legacyPath).catch(() => undefined)
  if (legacy && legacy.length <= 2 * 1024 * 1024 && total + legacy.length <= 8 * 1024 * 1024) {
    const dataUrl = `data:image/png;base64,${legacy.toString('base64')}`
    assets['legacy.widgets'] = { dataUrl, source: 'assets/minecraft/textures/gui/widgets.png' }
    assets.hotbar ??= { dataUrl, source: 'assets/minecraft/textures/gui/widgets.png', rect: [0, 0, 182, 22] }
    assets['hotbar.selection'] ??= { dataUrl, source: 'assets/minecraft/textures/gui/widgets.png', rect: [0, 22, 24, 24] }
    assets['button.normal'] ??= { dataUrl, source: 'assets/minecraft/textures/gui/widgets.png', rect: [0, 66, 200, 20] }
    assets['button.hover'] ??= { dataUrl, source: 'assets/minecraft/textures/gui/widgets.png', rect: [0, 86, 200, 20] }
  }
  return { active: true, sourceName: status.sourceName, assets }
}

function validateArchivePath(raw: string): string {
  if (raw.includes('\\') || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error('资源包包含不安全路径')
  }
  const clean = normalize(raw).replaceAll('\\', '/')
  if (clean === '..' || clean.startsWith('../') || clean.split('/').includes('..')) throw new Error('资源包包含路径穿越条目')
  return clean.replace(/^\.\//, '')
}

function isAllowedResource(name: string): boolean {
  if (name === 'pack.mcmeta') return true
  if (/^assets\/minecraft\/textures\/gui\/.+\.(png|mcmeta)$/i.test(name)) return true
  if (/^assets\/minecraft\/textures\/item\/[a-z0-9_]+\.png$/i.test(name)) return true
  if (/^assets\/minecraft\/font\/.+\.json$/i.test(name)) return true
  return /^assets\/minecraft\/sounds\/ui\/.+\.ogg$/i.test(name)
}

async function resolveItemDirectory(source: string): Promise<string> {
  const candidates = basename(source).toLowerCase() === 'items' || basename(source).toLowerCase() === 'item'
    ? [source]
    : [join(source, 'items'), join(source, 'item'), join(source, 'assets', 'minecraft', 'textures', 'item')]
  for (const candidate of candidates) if ((await stat(candidate).catch(() => undefined))?.isDirectory()) return realpath(candidate)
  throw new Error('没有找到 items 或 assets/minecraft/textures/item 目录')
}

function assertPng(bytes: Buffer, name: string): void {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`物品贴图不是有效 PNG：${name}.png`)
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (width !== height || width < 16 || width > 256 || (width & (width - 1)) !== 0) throw new Error(`物品贴图必须是 16–256 像素的正方形二次幂 PNG：${name}.png (${width}×${height})`)
}

function assertInside(root: string, target: string): void {
  const base = resolve(root)
  const value = resolve(target)
  if (value !== base && !value.startsWith(`${base}${sep}`)) throw new Error('资源路径越出缓存目录')
}

function parsePackMeta(bytes?: Uint8Array): Pick<ResourcePackStatus, 'packFormat' | 'description'> {
  if (!bytes) return {}
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as { pack?: { pack_format?: unknown, description?: unknown } }
    const packFormat = typeof json.pack?.pack_format === 'number' ? json.pack.pack_format : undefined
    const description = typeof json.pack?.description === 'string' ? json.pack.description.slice(0, 240) : undefined
    return { packFormat, description }
  } catch {
    return {}
  }
}

async function readGuiScaling(path: string): Promise<Pick<ResourceThemeAsset, 'slice' | 'repeat'>> {
  try {
    const json = JSON.parse(await readFile(path, 'utf8')) as { gui?: { scaling?: { type?: unknown, border?: unknown, stretch_inner?: unknown } } }
    const scaling = json.gui?.scaling
    if (scaling?.type !== 'nine_slice') return {}
    const border = scaling.border
    const slice: [number, number, number, number] | undefined = typeof border === 'number'
      ? [border, border, border, border]
      : border && typeof border === 'object'
        ? borderTuple(border as Record<string, unknown>)
        : undefined
    return slice ? { slice, repeat: scaling.stretch_inner === false ? 'repeat' : 'stretch' } : {}
  } catch {
    return {}
  }
}

function borderTuple(value: Record<string, unknown>): [number, number, number, number] | undefined {
  const left = numberOf(value.left), top = numberOf(value.top), right = numberOf(value.right), bottom = numberOf(value.bottom)
  return left !== undefined && top !== undefined && right !== undefined && bottom !== undefined
    ? [top, right, bottom, left]
    : undefined
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function publicStatus(row: StoredResourcePack): ResourcePackStatus {
  const { sourcePath: _sourcePath, ...safe } = row as StoredResourcePack & { sourcePath?: string }
  return safe
}

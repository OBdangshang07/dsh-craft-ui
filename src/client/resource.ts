export interface ResourcePackStatus {
  active: boolean
  hash?: string
  sourceName?: string
  importedAt?: string
  files: number
  bytes: number
  packFormat?: number
  description?: string
  capabilities: Record<'modernSprites' | 'legacyWidgets' | 'containers' | 'fonts' | 'sounds' | 'items', boolean>
}

interface RpcResult {
  ok: boolean
  value?: unknown
  error?: { message?: string }
}

interface ConnectionLike {
  isLoopback?: boolean
  rpc: { call(channel: string, endpoint: string, payload: unknown): Promise<RpcResult> }
}

export interface ResourcePackBridge {
  isLoopback: boolean
  status(): Promise<ResourcePackStatus>
  importArchive(path: string): Promise<ResourcePackStatus>
  importItemDirectory(path: string): Promise<ResourcePackStatus>
  clear(): Promise<ResourcePackStatus>
  refreshTheme(): Promise<void>
}

interface ResourceThemeAsset { dataUrl: string, source: string, slice?: [number, number, number, number], repeat?: 'stretch' | 'repeat', rect?: [number, number, number, number] }
interface ResourceTheme { active: boolean, sourceName?: string, assets: Record<string, ResourceThemeAsset> }

export function createResourcePackBridge(connection: ConnectionLike): ResourcePackBridge {
  const call = async (endpoint: string, payload: unknown): Promise<ResourcePackStatus> => {
    const result = await connection.rpc.call('/api', `craft-ui/${endpoint}`, payload)
    if (!result.ok) throw new Error(result.error?.message || 'Craft UI 资源操作失败')
    return result.value as ResourcePackStatus
  }
  const refreshTheme = async (): Promise<void> => {
    const result = await connection.rpc.call('/api', 'craft-ui/theme', {})
    if (!result.ok) throw new Error(result.error?.message || '无法读取资源主题')
    applyResourceTheme(result.value as ResourceTheme)
  }
  return {
    isLoopback: connection.isLoopback !== false,
    status: () => call('status', {}),
    importArchive: async path => { const status = await call('import', { path }); await refreshTheme(); return status },
    importItemDirectory: async path => { const status = await call('import-items', { path }); await refreshTheme(); return status },
    clear: async () => { const status = await call('clear', {}); applyResourceTheme({ active: false, assets: {} }); return status },
    refreshTheme,
  }
}

const VARS = [
  '--craft-import-button-normal', '--craft-import-button-hover', '--craft-import-button-disabled',
  '--craft-import-hotbar', '--craft-import-hotbar-selection', '--craft-import-xp-background', '--craft-import-xp-progress',
  '--craft-import-button-slice',
  '--craft-import-button-repeat',
  '--craft-item-pickaxe', '--craft-item-axe', '--craft-item-sword', '--craft-item-book', '--craft-item-compass',
  '--craft-item-emerald', '--craft-item-redstone', '--craft-item-helmet', '--craft-item-star', '--craft-item-eye',
  '--craft-item-paper', '--craft-item-clock', '--craft-item-xp', '--craft-item-agent', '--craft-item-totem',
  '--craft-item-map', '--craft-item-hopper', '--craft-item-command',
  '--craft-item-available-pickaxe', '--craft-item-available-axe', '--craft-item-available-sword', '--craft-item-available-book', '--craft-item-available-compass',
  '--craft-item-available-emerald', '--craft-item-available-redstone', '--craft-item-available-helmet', '--craft-item-available-star', '--craft-item-available-eye',
  '--craft-item-available-paper', '--craft-item-available-clock', '--craft-item-available-xp', '--craft-item-available-agent', '--craft-item-available-totem',
  '--craft-item-available-map', '--craft-item-available-hopper', '--craft-item-available-command',
]

export function applyResourceTheme(theme: ResourceTheme): void {
  const root = document.documentElement
  for (const name of VARS) root.style.removeProperty(name)
  delete document.body.dataset.craftAssets
  delete document.body.dataset.craftItems
  if (!theme.active) return
  const assets = theme.assets
  const setImage = (variable: string, semantic: string) => {
    const asset = assets[semantic]
    if (asset) root.style.setProperty(variable, `url("${asset.dataUrl}")`)
  }
  setImage('--craft-import-button-normal', 'button.normal')
  setImage('--craft-import-button-hover', 'button.hover')
  setImage('--craft-import-button-disabled', 'button.disabled')
  setImage('--craft-import-hotbar', 'hotbar')
  setImage('--craft-import-hotbar-selection', 'hotbar.selection')
  setImage('--craft-import-xp-background', 'xp.background')
  setImage('--craft-import-xp-progress', 'xp.progress')
  for (const name of ['pickaxe', 'axe', 'sword', 'book', 'compass', 'emerald', 'redstone', 'helmet', 'star', 'eye', 'paper', 'clock', 'xp', 'agent', 'totem', 'map', 'hopper', 'command']) {
    setImage(`--craft-item-${name}`, `item.${name}`)
    if (assets[`item.${name}`]) root.style.setProperty(`--craft-item-available-${name}`, '1')
  }
  const slice = assets['button.normal']?.slice
  if (slice) root.style.setProperty('--craft-import-button-slice', `${slice.join(' ')} fill`)
  root.style.setProperty('--craft-import-button-repeat', assets['button.normal']?.repeat === 'repeat' ? 'repeat' : 'stretch')
  if (assets.hotbar || assets['button.normal']) document.body.dataset.craftAssets = assets.hotbar?.rect || assets['button.normal']?.rect ? 'legacy' : 'modern'
  if (Object.keys(assets).some(name => name.startsWith('item.'))) document.body.dataset.craftItems = 'local'
}

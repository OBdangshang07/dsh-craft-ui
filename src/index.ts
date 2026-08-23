import Schema from '@deepseek-ai/schemastery'
import {
  clearResourcePackCache,
  importResourcePack,
  importLocalItemDirectory,
  readResourcePackStatus,
  readResourceTheme,
  resolveResourcePackRoot,
} from './host/resource-pack.ts'
export {
  clearResourcePackCache,
  importResourcePack,
  importLocalItemDirectory,
  readResourcePackStatus,
  readResourceTheme,
  resolveResourcePackRoot,
} from './host/resource-pack.ts'

export const name = 'craft-ui'

export interface Config {
  defaultTheme: 'day' | 'deepslate'
  defaultScale: 1 | 2 | 3
  motion: 'full' | 'reduced' | 'off'
  sounds: boolean
  allowLocalOfficialAssets: boolean
  dshHome?: string
}

export const Config: Schema<Config> = Schema.object({
  defaultTheme: Schema.union(['day', 'deepslate']).default('deepslate'),
  defaultScale: Schema.union([1, 2, 3]).default(2),
  motion: Schema.union(['full', 'reduced', 'off']).default('full'),
  sounds: Schema.boolean().default(false),
  allowLocalOfficialAssets: Schema.boolean().default(true),
  dshHome: Schema.string().description('Optional Harness home override used for the local resource cache.'),
}).description('DSH Craft UI host defaults. User presentation preferences remain client-local.')

export const inject = ['connection']

interface RpcContext {
  connection: {
    rpc: {
      handle(channel: string, handler: (endpoint: string, payload: unknown) => Promise<unknown>, options: { authority: 'loopback' }): unknown
    }
  }
}

/** Loopback-only host bridge for user-owned Minecraft archives. */
export function apply(ctx: RpcContext, config: Config): void {
  const root = resolveResourcePackRoot(config.dshHome)
  ctx.connection.rpc.handle('/craft-ui', async (endpoint, payload) => {
    try {
      if (endpoint === 'status') return { ok: true, value: await readResourcePackStatus(root) }
      if (endpoint === 'theme') return { ok: true, value: await readResourceTheme(root) }
      if (endpoint === 'import') {
        if (!config.allowLocalOfficialAssets) return failure('forbidden', 'Host 已禁用本地 Minecraft 素材导入')
        const path = typeof payload === 'object' && payload !== null && 'path' in payload
          ? (payload as { path?: unknown }).path
          : undefined
        if (typeof path !== 'string') return failure('bad-request', '资源包路径无效')
        return { ok: true, value: await importResourcePack(path, root) }
      }
      if (endpoint === 'import-items') {
        if (!config.allowLocalOfficialAssets) return failure('forbidden', 'Host 已禁用本地 Minecraft 素材导入')
        const path = typeof payload === 'object' && payload !== null && 'path' in payload
          ? (payload as { path?: unknown }).path
          : undefined
        if (typeof path !== 'string') return failure('bad-request', '物品贴图目录无效')
        return { ok: true, value: await importLocalItemDirectory(path, root) }
      }
      if (endpoint === 'clear') return { ok: true, value: await clearResourcePackCache(root) }
      return failure('not-found', '未知的 Craft UI 资源操作')
    } catch (error) {
      return failure('bad-request', error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'loopback' })
}

function failure(code: string, message: string) {
  return { ok: false, error: { code, message, details: {} } }
}

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

// Exact Fetch routes use the shared authenticated /api carrier. Custom RPC
// channels in 0.1.7 lose the caller's webServer injection through Cordis tracing.
export const inject = ['connection']

interface RpcContext {
  connection: {
    fetch: {
      register(route: { path: string, methods: string[], requestBody: 'buffered', fetch: (request: Request) => Promise<Response> }): unknown
    }
  }
}

/** Authenticated host bridge for user-owned Minecraft archives. */
export function apply(ctx: RpcContext, config: Config): void {
  const root = resolveResourcePackRoot(config.dshHome)
  const handle = async (endpoint: string, payload: unknown) => {
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
  }
  for (const endpoint of ['status', 'theme', 'import', 'import-items', 'clear']) {
    ctx.connection.fetch.register({
      path: `/api/craft-ui/${endpoint}`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async request => {
        const body = await request.json().catch(() => null)
        if (!body || body.type !== 'client-request' || typeof body.rpcId !== 'string' || !body.rpcId || body.method !== `craft-ui/${endpoint}`) {
          return new Response('Invalid Craft UI RPC envelope', { status: 400 })
        }
        return Response.json({ type: 'server-response', rpcId: body.rpcId, result: await handle(endpoint, body.payload) })
      },
    })
  }
}

function failure(code: string, message: string) {
  return { ok: false, error: { code, message, details: {} } }
}

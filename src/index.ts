import Schema from '@deepseek-ai/schemastery'
import { dirname, join } from 'node:path'
import { mutateNotebook, readNotebook, sourceText } from './host/notebook.ts'
import { object, validateEntry } from './workbench.ts'
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
export const inject = ['connection', 'sessionQuery']

interface RpcContext {
  profileContext?: { dir: string }
  sessionQuery?: {
    readTitleSnapshots(ids: string[]): Promise<any[]>
    readEvent(request: { sessionId: string, seq: number }): Promise<any>
  }
  connection: {
    fetch: {
      register(route: { path: string, methods: string[], requestBody: 'buffered', fetch: (request: Request) => Promise<Response> }): unknown
    }
  }
}

/** Authenticated host bridge for user-owned Minecraft archives. */
export function apply(ctx: RpcContext, config: Config): void {
  const root = resolveResourcePackRoot(config.dshHome)
  const notebookRoot = join(ctx.profileContext?.dir ?? dirname(root), 'craft-notebooks')
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
  for (const endpoint of ['notebook/read', 'notebook/mutate', 'notebook/source']) {
    ctx.connection.fetch.register({
      path: `/api/craft-ui/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
      fetch: async request => {
        const raw = await request.text()
        if (Buffer.byteLength(raw) > 65536) return new Response('Payload too large', { status: 413 })
        let body: any
        try { body = JSON.parse(raw) } catch { return new Response('Invalid JSON', { status: 400 }) }
        if (body?.type !== 'client-request' || typeof body.rpcId !== 'string' || !body.rpcId || body.method !== `craft-ui/${endpoint}`) return new Response('Invalid RPC envelope', { status: 400 })
        let result
        try {
          if (!ctx.sessionQuery) throw new Error('Session history service unavailable')
          const data = object(body.payload), sessionId = data.sessionId
          if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) throw new Error('Invalid Session')
          const observations = await ctx.sessionQuery.readTitleSnapshots([sessionId])
          if (observations[0]?.status !== 'fulfilled') throw new Error('Session unavailable in this profile')
          if (endpoint === 'notebook/read') result = { ok: true, value: await readNotebook(notebookRoot, sessionId) }
          else {
            if (endpoint === 'notebook/source' || data.action === 'save') {
              const entry = endpoint === 'notebook/source' ? null : validateEntry(data.entry)
              const seq = entry?.seq ?? data.seq
              if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('Invalid source event')
              const source = await ctx.sessionQuery.readEvent({ sessionId, seq })
              const text = sourceText(source.target)
              if (entry) {
                if (entry.kind === 'annotation') {
                  const parts = object(object(source.target.data).message).content
                  if (source.target.type !== 'tool/result' || !Array.isArray(parts) || !parts.some(p => p.type === 'image' && p.attachment?.attachmentId === entry.attachmentId)) throw new Error('Image not present in the referenced event')
                } else if (!text.includes(entry.text)) throw new Error('Selected text is not present in the source message')
              } else result = { ok: true, value: { seq, type: source.target.type, time: source.target.time, text: text.slice(0, 64000), truncated: text.length > 64000 } }
            }
            if (endpoint === 'notebook/mutate') result = { ok: true, value: await mutateNotebook(notebookRoot, sessionId, data) }
          }
        } catch (error) { result = failure('notebook-error', error instanceof Error ? error.message : String(error)) }
        return Response.json({ type: 'server-response', rpcId: body.rpcId, result })
      },
    })
  }
}

function failure(code: string, message: string) {
  return { ok: false, error: { code, message, details: {} } }
}

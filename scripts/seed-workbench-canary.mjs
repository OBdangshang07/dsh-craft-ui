// DSH Host fixture plugin. Refuses every home except explicitly isolated canaries.
// Does not activate an agent or make model requests. Never included in the tarball.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const canaryDirectories = [join(root, '.generated', 'workbench-canary'), join(root, '.generated', 'dsh-021-compat', 'workbench-canary')]
export const inject = ['sessionPersistence', 'attachments', 'workspaceRegistry']
export async function apply(ctx) {
  const directory = canaryDirectories.find(dir => process.env.DSH_HOME && resolve(process.env.DSH_HOME) === join(dir, 'home'))
  if (!directory) throw new Error('Fixture refused: DSH_HOME must be an explicitly allowlisted isolated canary home')
  const require = createRequire(resolve(process.argv[1]))
  const { SESSION_FORMAT_VERSION, Session } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')).href)
  const workspace = await ctx.workspaceRegistry.create(directory, 'Craft 0.4 隔离自检')
  const id = 'c8cd6e4e-38ab-49f9-b12e-a562d8f02721'
  if (await ctx.sessionPersistence.stat(id)) { await workspace.attachSession(id); return }
  const header = { id, version: SESSION_FORMAT_VERSION, createdAt: Date.now(), cwd: directory, isSeeded: false, agentPreset: 'standard' }
  const events = [], add = (type, data, surface = false) => events.push({ seq: events.length, time: header.createdAt + events.length * 100, type, data, ...(surface ? { surfaceOp: 'append' } : {}) })
  const refs = await Promise.all(['stone', 'deepslate', 'planks'].map(async name => ctx.attachments.saveImage({ data: await readFile(join(root, 'assets', 'generated', `${name}.png`)), mediaType: 'image/png', name: `${name}.png` })))
  const source = { kind: 'model', provider: 'fixture', model: 'no-model-called' }
  add('turn/start', { turn: 1 })
  add('user/message', { id: 'fixture-human', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Craft 0.4 集成自检：图片、书签与草稿（隔离夹具，不调用模型）' }] }, true)
  add('step/start', { turn: 1, step: 1 })
  const calls = refs.map((ref, i) => ({ type: 'tool-call', id: `fixture-read-${i}`, name: 'read_image', arguments: JSON.stringify({ file_path: `fixture/${ref.name}` }) }))
  add('assistant/message', { turn: 1, step: 1, stream: [], message: { id: 'fixture-calls', role: 'assistant', source, content: calls } }, true)
  for (const [i, ref] of refs.entries()) {
    add('tool/call', { turn: 1, step: 1, callId: calls[i].id, name: 'read_image', arguments: calls[i].arguments })
    add('tool/result', { turn: 1, step: 1, meta: { path: `fixture/${ref.name}` }, message: { id: `fixture-result-${i}`, role: 'tool', toolCallId: calls[i].id, source: { kind: 'tool', callId: calls[i].id }, isError: false, content: [{ type: 'text', text: `<path>fixture/${ref.name}</path>\n<type>image</type>\n<content>image/png ${ref.width}x${ref.height}</content>` }, { type: 'image', attachment: ref }] } }, true)
  }
  add('step/end', { turn: 1, step: 1 })
  add('step/start', { turn: 1, step: 2 })
  add('assistant/message', { turn: 1, step: 2, stream: [], message: { id: 'fixture-final', role: 'assistant', source, content: [{ type: 'text', text: '三个持久图片附件已经存入隔离测试会话。请验证缩略图、标注保存与消息书签。' }] } }, true)
  add('step/end', { turn: 1, step: 2 })
  add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  if (directory === canaryDirectories[1]) {
    const goal = { id: 'craft-alpha-layout-goal', revision: 1, phase: 'active', maxGoalRounds: 4, objective: '检查多行目标编辑器\n保持 Minecraft 像素字体\n自动增长面板高度\n保留底部经验值空间\n检查窄屏输入和按钮\n不提交任何模型请求\n超过六行使用滚动' }
    add('goal/change', { kind: 'goal/change', version: 1, operation: 'create', goal, roundsStarted: 0, createdAt: header.createdAt, updatedAt: header.createdAt })
    add('goal/change', { kind: 'goal/change', version: 1, operation: 'pause', goal: { ...goal, revision: 2, phase: 'paused' }, roundsStarted: 0, createdAt: header.createdAt, updatedAt: header.createdAt + events.length * 100 })
  }
  Session.create(id, events, header)
  const writer = await ctx.sessionPersistence.create(header)
  try { await writer.append(events); await writer.flush() } finally { await writer.close() }
  await workspace.attachSession(id)
  console.log('Craft seeded isolated image regression Session')
}

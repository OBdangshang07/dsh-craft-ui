// Browser-only regression fixture. Never shipped or mounted in a user's profile.
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { installWorkbench } from '../src/client/workbench/index.tsx'
import { setPreferences } from '../src/client/store.ts'

const rows = new Map<string, any>(), effects: Array<() => void> = []
const ctx = { slots: {
  inject: (_name: string, fn: () => any) => fn(),
  register: (options: any, component: any) => { const key = options.name + ':' + (options.key ?? options.id); rows.set(key, component); return () => rows.delete(key) },
}, effect: (fn: () => (() => void)) => { const dispose = fn(); if (dispose) effects.push(dispose) } }
let notebook = { schema: 1, revision: 0, entries: [] as any[] }
let promptCalls = 0
const connection = { rpc: { call: async (_: string, method: string, payload: any) => {
  if (method.endsWith('/read')) return { ok: true, value: structuredClone(notebook) }
  if (method.endsWith('/source')) return { ok: true, value: { seq: payload.seq, text: '使用 Java 版布局，物品贴图可以本地导入，UI 仍然原创。', time: Date.now(), type: 'user/message', truncated: false } }
  if (method.endsWith('/mutate')) {
    if (payload.revision !== notebook.revision) return { ok: false, error: { message: 'Revision conflict' } }
    if (payload.action === 'delete') notebook.entries = notebook.entries.filter(e => e.id !== payload.id)
    else { const old = notebook.entries.find(e => e.id === payload.entry.id); notebook.entries = notebook.entries.filter(e => e.id !== payload.entry.id); notebook.entries.push({ ...payload.entry, history: old ? [...old.history, old] : [] }) }
    notebook.revision++; return { ok: true, value: structuredClone(notebook) }
  }
  promptCalls++; throw new Error('Unexpected model request')
} } }
function imageData(color: string, variant: number) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400
  const c = canvas.getContext('2d')!; c.fillStyle = '#9fc3d8'; c.fillRect(0, 0, 640, 400); c.fillStyle = '#647d3b'; c.fillRect(0, 230, 640, 170)
  c.fillStyle = '#79684c'; c.fillRect(145, 140, 340, 160); c.fillStyle = color
  for (let i = 0; i < 4; i++) c.fillRect(105 + i * 30, 110 - i * 22, 420 - i * 60, 24)
  c.fillStyle = '#3e4230'; c.fillRect(292, 215, 58, 85); c.fillStyle = '#e4c884'; c.fillRect(198, 182, 47, 47); c.fillRect(385, 182, 47, 47)
  c.fillStyle = '#e9e4c5'; c.font = '18px monospace'; c.fillText(`Map ${variant + 1} / immutable read snapshot`, 18, 378)
  return canvas.toDataURL('image/png')
}
const urls = ['#885b39', '#47736d', '#b7894a'].map(imageData)
const tools = urls.map((_, i) => ({ kind: 'tool-result', seq: i + 8, time: Date.now(), callId: `read-${i}`, call: { name: 'read_image', argsRaw: JSON.stringify({ file_path: `H:/截图/建筑方案-${i + 1}.png` }) }, isError: false, subCalls: [], content: [{ type: 'text', text: '<type>image</type>\n<content>image/png 640x400</content>' }, { type: 'image', attachment: { attachmentId: `fixture-image-${i}`, mediaType: 'image/png', bytes: 2000, width: 640, height: 400 } }] }))
const nodes = [{ kind: 'user', seq: 1, time: Date.now(), content: [{ type: 'text', text: '使用 Java 版布局，物品贴图可以本地导入，UI 仍然原创。' }] }, ...tools, { kind: 'assistant', seq: 12, messageId: 'reply-1', time: Date.now(), blocks: [{ kind: 'text', text: '已读取三张建筑方案，可以逐图查看、对比并框选需要调整的位置。' }] }]
const toolData = tools.map(root => ({ root })), source = { getSnapshot: () => toolData, subscribe: () => () => {} }
const chat = { nodes: { turnDataSource: () => source }, legacy: { nodes } }
installWorkbench(ctx, connection, { imageUrl: (_: string, image: any) => Promise.resolve(urls[Number(image.attachmentId.split('-').at(-1))]) })
const TurnImages = rows.get('conversation.chat.turnTail:craft-image-journal'), BookButton = rows.get('conversation.session.header.actions:craft-notebook'), BookmarkAction = rows.get('conversation.chat.assistant-actions:craft-bookmark'), ReadImage = rows.get('tool.call.toolview:read_image')
const fixture = document.createElement('div'); fixture.id = 'craft-workbench-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--craft-work-bg);color:var(--craft-work-text);overflow:auto;padding:32px;box-sizing:border-box'
document.body.append(fixture)
function App() {
  const [draft, setDraft] = React.useState('保留我的现有输入 @file'), [revision, setRevision] = React.useState(0)
  const input = { draft, draftRev: revision, phase: 'plain' }, live = React.useRef(input); live.current = input
  const actions = React.useMemo(() => ({ insertText: (text: string, span: any) => { if (span.draftRev !== live.current.draftRev) return false; setDraft(s => s.slice(0, span.start) + text + s.slice(span.end)); setRevision(r => r + 1); return true }, submit: () => { promptCalls++ } }), [])
  const props = { sessionId: 'fixture-session', useInput: (select: any) => select(input), inputActions: actions, useChat: (select: any) => select(chat), turn: { turn: 1 }, messageId: 'reply-1', loadImage: (ref: any) => Promise.resolve(urls[Number(ref.attachmentId.split('-').at(-1))]) }
  return <div style={{ maxWidth: 950, margin: 'auto' }}><header style={{ display: 'flex', gap: 12, alignItems: 'center' }}><h1 style={{ fontSize: 20 }}>Craft UI · 地图与书签</h1><BookButton {...props} /><button id="fixture-day" onClick={() => setPreferences({ theme: 'craft-day' })}>白昼</button><button id="fixture-night" onClick={() => setPreferences({ theme: 'craft-deepslate' })}>夜晚</button></header><p>浏览器回归夹具 · 不调用模型 · 非真实任务</p><ReadImage {...props} block={tools[0]} callId="read-0" /><TurnImages {...props} /><p>已读取三张建筑方案，可以逐图查看、对比并框选需要调整的位置。</p><BookmarkAction {...props} /><textarea id="fixture-draft" value={draft} onChange={e => { setDraft(e.target.value); setRevision(r => r + 1) }} style={{ width: '100%', height: 100, marginTop: 24 }} /><output id="fixture-prompts">{promptCalls}</output></div>
}
createRoot(fixture).render(<App />)
Object.assign(window, { craftWorkbenchFixture: { notes: () => notebook, calls: () => promptCalls, rows: () => [...rows.keys()], setPreferences } })

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { MAX_NOTE_TEXT, object, textContent, validateEntry, type NotebookEntry, type NoteKind } from '../../workbench.ts'
import { CraftDialog, downloadText, useTranslate } from './ui.tsx'
import type { NotebookBridge } from './bridge.ts'

export interface MessageSource { seq: number, text: string, role: string, time: number }
function noteFeedback(entry: NotebookEntry, sessionId: string) {
  const area = entry.region ? `\nAttachment: ${entry.attachmentId}\nRegion / 区域: ${Object.entries(entry.region).map(([key, value]) => `${key}=${(value * 100).toFixed(1)}%`).join(', ')}` : ''
  return `[Saved excerpt / 收藏摘录 — session ${sessionId}, event #${entry.seq}]\n${entry.text}${area}\n${entry.note}`
}
export function messageSources(nodes: readonly any[]): MessageSource[] {
  return nodes.flatMap(node => {
    if (!['user', 'steering', 'assistant'].includes(node.kind) || !Number.isSafeInteger(node.seq)) return []
    const text = textContent(node.content ?? node.blocks)
    return text ? [{ seq: node.seq, text, role: node.kind === 'assistant' ? 'assistant' : 'user', time: node.time }] : []
  })
}
export function NotebookPanel({ bridge, nodes, initial, append, onClose }: { bridge: NotebookBridge, nodes: readonly any[], initial?: MessageSource, append: (text: string) => boolean, onClose: () => void }) {
  const tr = useTranslate(), snapshot = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
  const [tab, setTab] = useState<'saved' | 'messages'>('saved'), [filter, setFilter] = useState(''), [status, setStatus] = useState('')
  const [editing, setEditing] = useState<NotebookEntry>(), [source, setSource] = useState<{ seq: number, text: string, truncated?: boolean }>(), [deleteId, setDeleteId] = useState<string>()
  const [imports, setImports] = useState<NotebookEntry[]>(), [busy, setBusy] = useState(false), [limit, setLimit] = useState(30)
  const alive = useRef(true), sourceRequest = useRef(0)
  const messages = useMemo(() => messageSources(nodes).reverse(), [nodes])
  useEffect(() => { alive.current = true; void bridge.load(); return () => { alive.current = false; sourceRequest.current++ } }, [bridge])
  const create = (message: MessageSource, selected?: string) => setEditing({ id: crypto.randomUUID(), seq: message.seq, text: (selected && message.text.includes(selected) ? selected : message.text).slice(0, MAX_NOTE_TEXT), kind: 'decision', note: '', tags: '', time: Date.now(), history: [] })
  useEffect(() => { if (initial) create(initial) }, [])
  const labels: Record<NoteKind, string> = { constraint: tr('约束', 'Constraint'), decision: tr('已决定', 'Decision'), question: tr('待解决', 'Open question'), annotation: tr('图片标注', 'Image annotation') }
  const entries = snapshot.data.entries.filter(e => `${e.text} ${e.note} ${e.tags} ${labels[e.kind]}`.toLowerCase().includes(filter.toLowerCase())).slice().reverse()
  const run = async (task: () => Promise<void>) => { setBusy(true); setStatus(''); try { await task() } catch (error) { if (alive.current) setStatus(String(error)) } finally { if (alive.current) setBusy(false) } }
  const openSource = async (seq: number) => {
    const request = ++sourceRequest.current; setStatus(tr('正在读取来源…', 'Loading source…'))
    try { const next = await bridge.source(seq); if (alive.current && request === sourceRequest.current) { setSource(next); setStatus('') } }
    catch (error) { if (alive.current && request === sourceRequest.current) setStatus(String(error)) }
  }
  return <CraftDialog title={tr('书与羽毛笔 · 会话书签', 'Book & quill · Session notebook')} icon="book" onClose={onClose}>
    <nav className="craft-workbench-toolbar" aria-label={tr('书签册页面', 'Notebook pages')}><button aria-pressed={tab === 'saved'} onClick={() => { setTab('saved'); setEditing(undefined); setSource(undefined) }}>{tr('我的书签', 'Saved')} ({snapshot.data.entries.length})</button><button aria-pressed={tab === 'messages'} onClick={() => { setTab('messages'); setEditing(undefined); setSource(undefined) }}>{tr('收藏消息', 'Bookmark a message')}</button><button disabled={snapshot.loading || busy} onClick={() => void bridge.load(true)}>{tr('刷新', 'Refresh')}</button></nav>
    {snapshot.loading && <p role="status" className="craft-workbench-notice">{tr('正在载入书签册…', 'Loading notebook…')}</p>}
    {(snapshot.error || status) && <p role="status" className="craft-workbench-notice">{status || snapshot.error}</p>}
    <main className="craft-notebook-pages">
      {source ? <article className="craft-notebook-source"><h3>{tr('来源原文', 'Source message')} #{source.seq}</h3><pre>{source.text}</pre>{source.truncated && <p>{tr('原文过长，此处展示前 64,000 字符。', 'Long source: showing the first 64,000 characters.')}</p>}<button onClick={() => setSource(undefined)}>{tr('返回', 'Back')}</button></article> : editing ? <form className="craft-note-editor" onSubmit={e => { e.preventDefault(); void run(async () => { await bridge.mutate('save', editing); if (alive.current) { setEditing(undefined); setTab('saved'); setStatus(tr('已保存；没有发送给模型。', 'Saved; not sent to the model.')) } }) }}>
        <h3>{tr('记录一条决定', 'Keep a decision')} · #{editing.seq}</h3><label>{tr('原文摘录（来源保持不变）', 'Source excerpt (unchanged)')}<textarea readOnly value={editing.text} rows={5} /></label>
        <div className="craft-workbench-toolbar"><label>{tr('类别', 'Category')}<select value={editing.kind} disabled={editing.kind === 'annotation'} onChange={e => setEditing({ ...editing, kind: e.target.value as NoteKind })}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key} disabled={key === 'annotation' && editing.kind !== 'annotation'}>{label}</option>)}</select></label><label>{tr('标签', 'Tags')}<input maxLength={200} value={editing.tags} onChange={e => setEditing({ ...editing, tags: e.target.value })} /></label></div>
        <label>{tr('我的备注', 'My note')}<textarea maxLength={4000} rows={3} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
        {editing.kind !== 'annotation' && <label>{tr('替代旧卡片（可选，不删除原记录）', 'Supersedes (optional; keeps the old record)')}<select value={editing.supersedes ?? ''} onChange={e => setEditing({ ...editing, supersedes: e.target.value || undefined })}><option value="">{tr('不替代', 'None')}</option>{snapshot.data.entries.filter(e => e.id !== editing.id && e.kind !== 'annotation').map(e => <option key={e.id} value={e.id}>#{e.seq} {e.text.slice(0, 50)}</option>)}</select></label>}
        <div className="craft-workbench-toolbar"><button type="submit" disabled={busy || snapshot.loading}>{tr('保存', 'Save')}</button><button type="button" onClick={() => setEditing(undefined)}>{tr('取消', 'Cancel')}</button></div>
        {!!editing.history.length && <details><summary>{tr(`历史版本（${editing.history.length}）`, `Earlier versions (${editing.history.length})`)}</summary>{editing.history.slice().reverse().map((v, i) => <article key={i}><small>{new Date(v.time).toLocaleString()} · {labels[v.kind]}</small><pre>{v.text}{'\n'}{v.note}{v.region ? `\n${Object.entries(v.region).map(([k, n]) => `${k}=${(n * 100).toFixed(1)}%`).join(', ')}` : ''}</pre></article>)}</details>}
      </form> : tab === 'messages' ? <>
        <p className="craft-workbench-notice">{tr('显示当前已载入的消息。可先选中原文，再点“收藏摘录”；更早的消息请先在对话中载入。', 'Currently loaded messages. Select text before bookmarking an excerpt. Load older messages in chat first.')}</p>
        {messages.slice(0, limit).map(message => <article className="craft-note-card" key={message.seq}><header><b>{message.role === 'user' ? tr('你', 'You') : 'AI'}</b><small>#{message.seq} · {new Date(message.time).toLocaleString()}</small></header><pre>{message.text}</pre><button onClick={event => { const selection = window.getSelection(); const card = event.currentTarget.closest('article'); const selected = selection && card?.contains(selection.anchorNode) && card.contains(selection.focusNode) ? selection.toString() : ''; create(message, selected) }}>{tr('收藏摘录', 'Bookmark excerpt')}</button></article>)}
        {messages.length > limit && <button onClick={() => setLimit(n => n + 30)}>{tr('显示更多', 'Show more')}</button>}{!messages.length && <p>{tr('还没有可收藏的消息。', 'No messages available yet.')}</p>}
      </> : <>
        <input type="search" aria-label={tr('搜索书签', 'Search bookmarks')} placeholder={tr('搜索摘录、备注或标签…', 'Search excerpts, notes or tags…')} value={filter} onChange={e => setFilter(e.target.value)} />
        <p className="craft-workbench-notice">{tr('收藏不会自动进入模型上下文。相互冲突的约束需由你确认；旧决定不会自动删除。', 'Bookmarks are not model context. Resolve conflicting constraints explicitly; old decisions are retained.')}</p>
        {entries.slice(0, limit).map(entry => <article className="craft-note-card" key={entry.id} data-superseded={snapshot.data.entries.some(e => e.supersedes === entry.id) || undefined}><header><b>{labels[entry.kind]}</b><small>#{entry.seq}{snapshot.data.entries.some(e => e.supersedes === entry.id) ? ` · ${tr('已被替代', 'Superseded')}` : ''}</small></header><pre>{entry.text}</pre>{entry.note && <p className="craft-note-comment">{entry.note}</p>}{entry.tags && <small>{entry.tags}</small>}
          <div className="craft-workbench-toolbar"><button onClick={() => void openSource(entry.seq)}>{tr('来源原文', 'Source')}</button><button onClick={() => setEditing(entry)}>{tr('编辑 / 历史', 'Edit / history')}</button><button onClick={() => setStatus(append(noteFeedback(entry, bridge.sessionId)) ? tr('已加入草稿，未发送。', 'Added to draft, not sent.') : tr('输入框正忙或已变化，请重试。', 'Composer busy or changed. Please retry.'))}>{tr('加入草稿', 'Add to draft')}</button><button onClick={() => setDeleteId(entry.id)}>{tr('删除', 'Delete')}</button></div>
          {deleteId === entry.id && <div role="alert"><p>{tr('只删除这条书签，不影响原始对话。', 'Delete only this bookmark; the conversation is unchanged.')}</p><button disabled={busy || snapshot.loading} onClick={() => void run(async () => { await bridge.mutate('delete', entry.id); if (alive.current) setDeleteId(undefined) })}>{tr('确认删除', 'Confirm delete')}</button><button onClick={() => setDeleteId(undefined)}>{tr('取消', 'Cancel')}</button></div>}
        </article>)}
        {entries.length > limit && <button onClick={() => setLimit(n => n + 30)}>{tr('显示更多', 'Show more')}</button>}
        {!entries.length && <div className="craft-notebook-empty"><h3>{tr('这本书还没有内容', 'This book is empty')}</h3><p>{tr('从“收藏消息”开始，或点击 AI 回复后的书签按钮。', 'Start with Bookmark a message, or use the bookmark action beneath an AI reply.')}</p></div>}
      </>}
    </main>
    <footer className="craft-workbench-toolbar"><button disabled={snapshot.loading || !snapshot.data.entries.length} onClick={() => downloadText('craft-notebook.json', JSON.stringify({ sessionId: bridge.sessionId, ...snapshot.data }, null, 2))}>{tr('导出书签', 'Export')}</button><label className="craft-notebook-import">{tr('导入备份', 'Import backup')}<input type="file" accept="application/json,.json" disabled={busy || snapshot.loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void run(async () => { if (file.size > 4 * 1024 * 1024) throw new Error('Backup exceeds 4 MiB'); const data = object(JSON.parse(await file.text())); if (data.schema !== 1 || data.sessionId !== bridge.sessionId || !Array.isArray(data.entries) || data.entries.length > 300) throw new Error(tr('只接受同一会话的 v1 书签备份。', 'Only v1 backups from this Session are accepted.')); const rows = data.entries.map(validateEntry).filter(e => !snapshot.data.entries.some(old => old.id === e.id)); if (alive.current) setImports(rows) }) }} /></label><small>{tr('保存在本机 · 不修改会话', 'Stored locally · Conversation unchanged')}</small></footer>
    {imports && <div className="craft-import-confirm"><p>{tr(`待导入 ${imports.length} 条。逐条核验来源；已有 ID 跳过，不覆盖现有书签。`, `${imports.length} new entries. Sources will be verified; existing IDs are skipped.`)}</p><button disabled={busy || snapshot.loading} onClick={() => void run(async () => { let done = 0; try { for (const entry of imports) { if (!alive.current) break; await bridge.mutate('save', { ...entry, supersedes: undefined }); done++ } if (alive.current) setImports(undefined) } finally { if (alive.current) setStatus(tr(`已导入 ${done} 条；导入不恢复旧修订与替代关系。`, `Imported ${done}; historical revisions and replacement links are not restored.`)) } })}>{tr('确认导入', 'Confirm import')}</button><button disabled={busy} onClick={() => setImports(undefined)}>{tr('取消', 'Cancel')}</button></div>}
  </CraftDialog>
}

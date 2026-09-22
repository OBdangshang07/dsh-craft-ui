import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { emptyNotebook, MAX_NOTES, object, textContent, validateEntry, type Notebook } from '../workbench.ts'

const LIMIT = 4 * 1024 * 1024
const queues = new Map<string, Promise<unknown>>()
export function notebookFile(root: string, sessionId: string): string {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256) throw new Error('Invalid Session')
  return join(resolve(root), createHash('sha256').update(sessionId).digest('hex') + '.json')
}
export async function readNotebook(root: string, sessionId: string): Promise<Notebook> {
  const file = notebookFile(root, sessionId)
  try {
    const info = await stat(file)
    if (info.size > LIMIT) throw new Error('Notebook too large')
    const row = JSON.parse(await readFile(file, 'utf8'))
    if (row.schema !== 1 || !Number.isSafeInteger(row.revision) || row.revision < 0 || !Array.isArray(row.entries) || row.entries.length > MAX_NOTES) throw new Error('Unsupported or damaged notebook; original retained')
    const ids = new Set<string>()
    for (const entry of row.entries) {
      validateEntry(entry)
      if (ids.has(entry.id) || !Number.isFinite(entry.time)) throw new Error('Damaged entry; original retained')
      ids.add(entry.id)
      if (!Array.isArray(entry.history) || entry.history.length > 20) throw new Error('Damaged history; original retained')
      for (const version of entry.history) {
        validateEntry({ ...version, id: entry.id, seq: entry.seq, attachmentId: entry.attachmentId })
        if (!Number.isFinite(version.time)) throw new Error('Damaged history; original retained')
      }
    }
    return row
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyNotebook()
    throw error
  }
}
/** Cross-process lock + revision CAS + synced replacement. Never last-writer-wins. */
export async function mutateNotebook(root: string, sessionId: string, payload: unknown): Promise<Notebook> {
  const file = notebookFile(root, sessionId)
  const previous = queues.get(file) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(async () => {
    await mkdir(root, { recursive: true })
    const lock = await open(file + '.lock', 'wx').catch(() => { throw new Error('Notebook is busy; retry. A stale lock after a crash must be reviewed before removal.') })
    let temp: string | undefined
    try {
      const data = object(payload), current = await readNotebook(root, sessionId)
      if (data.revision !== current.revision) throw new Error('Notebook changed in another window; reload before saving')
      let entries = current.entries.slice()
      if (data.action === 'delete') {
        if (typeof data.id !== 'string' || !entries.some(e => e.id === data.id)) throw new Error('Note not found')
        entries = entries.filter(e => e.id !== data.id)
      } else if (data.action === 'save') {
        const entry = validateEntry(data.entry)
        const old = entries.find(e => e.id === entry.id)
        if (old && (old.seq !== entry.seq || old.attachmentId !== entry.attachmentId)) throw new Error('A note cannot change its source')
        if (entry.supersedes && (!entries.some(e => e.id === entry.supersedes) || old?.supersedes !== undefined && old.supersedes !== entry.supersedes)) throw new Error('Replacement target unavailable')
        // Replacement chains cannot loop, even when editing an existing note.
        let cursor = entry.supersedes
        const seen = new Set([entry.id])
        while (cursor) { if (seen.has(cursor)) throw new Error('Replacement cycle'); seen.add(cursor); cursor = entries.find(e => e.id === cursor)?.supersedes }
        if (old) entry.history = [...old.history, { text: old.text, note: old.note, tags: old.tags, kind: old.kind, time: old.time, ...(old.region ? { region: old.region } : {}) }].slice(-20)
        entries = old ? entries.map(e => e.id === entry.id ? entry : e) : [...entries, entry]
      } else throw new Error('Unknown notebook operation')
      if (entries.length > MAX_NOTES) throw new Error(`Notebook limit: ${MAX_NOTES}`)
      const next: Notebook = { schema: 1, revision: current.revision + 1, entries }
      const body = JSON.stringify(next)
      if (Buffer.byteLength(body) > LIMIT) throw new Error('Notebook storage limit exceeded')
      temp = `${file}.${randomUUID()}.tmp`
      const writer = await open(temp, 'wx', 0o600)
      try { await writer.writeFile(body); await writer.sync() } finally { await writer.close() }
      await rename(temp, file)
      temp = undefined
      return next
    } finally {
      if (temp) await unlink(temp).catch(() => {})
      await lock.close()
      await unlink(file + '.lock')
    }
  })
  queues.set(file, operation)
  try { return await operation } finally { if (queues.get(file) === operation) queues.delete(file) }
}

/** Only user-visible message text is returned; never system prompts or reasoning. */
export function sourceText(target: unknown): string {
  const event = object(target), data = object(event.data)
  if (!['user/message', 'assistant/message', 'tool/result'].includes(event.type)) throw new Error('Source is not a visible message')
  const message = event.type === 'user/message' ? data : object(data.message)
  return textContent(message.content)
}

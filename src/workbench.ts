/** Versioned, data-only contracts shared by the Host and browser. */
export interface ImageRef {
  attachmentId: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  width: number
  height: number
  bytes: number
  name?: string
}
export interface ViewedImage {
  key: string
  attachment: ImageRef
  path: string
  callId: string
  seq: number
  time: number
  reads: number
}
export interface Region { x: number, y: number, width: number, height: number }
export type NoteKind = 'constraint' | 'decision' | 'question' | 'annotation'
export interface NoteVersion { text: string, note: string, kind: NoteKind, tags: string, time: number, region?: Region }
export interface NotebookEntry extends NoteVersion {
  id: string
  seq: number
  attachmentId?: string
  region?: Region
  supersedes?: string
  history: NoteVersion[]
}
export interface Notebook { schema: 1, revision: number, entries: NotebookEntry[] }
export const emptyNotebook = (): Notebook => ({ schema: 1, revision: 0, entries: [] })
export const MAX_NOTES = 300
export const MAX_NOTE_TEXT = 8000

export function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
export function imageRef(value: unknown): ImageRef | undefined {
  const row = object(value)
  if (typeof row.attachmentId !== 'string' || !row.attachmentId || row.attachmentId.length > 512) return
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(row.mediaType)) return
  if (![row.width, row.height, row.bytes].every(n => Number.isSafeInteger(n) && n > 0)) return
  // Protect the browser from pathological decoding even if a provider permits it.
  if (row.width * row.height > 40_000_000 || row.bytes > 32 * 1024 * 1024) return
  return { attachmentId: row.attachmentId, mediaType: row.mediaType, width: row.width, height: row.height, bytes: row.bytes, ...(typeof row.name === 'string' ? { name: row.name.slice(0, 512) } : {}) }
}
export function textContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.filter(p => object(p).type === 'text' || object(p).kind === 'text').map(p => typeof p.text === 'string' ? p.text : '').join('\n')
}
export function imagesFromCall(value: unknown): ViewedImage[] {
  const block = object(value)
  if (block.kind !== 'tool-result' || block.isError !== false || object(block.call).name !== 'read_image') return []
  if (!Number.isSafeInteger(block.seq) || block.seq < 0 || !Array.isArray(block.content)) return []
  let args: Record<string, any>
  try { args = object(JSON.parse(block.call.argsRaw)) } catch { return [] }
  if (typeof args.file_path !== 'string' || !args.file_path.trim()) return []
  const images: ViewedImage[] = []
  for (const part of block.content) {
    if (object(part).type !== 'image') continue
    const ref = imageRef(part.attachment)
    if (!ref) return [] // Never display a misleading partial result.
    images.push({ key: ref.attachmentId, attachment: ref, path: args.file_path, callId: block.callId, seq: block.seq, time: block.time, reads: 1 })
  }
  return images
}
export function collectImages(roots: readonly unknown[]): ViewedImage[] {
  const found = new Map<string, ViewedImage>()
  const calls = new Set<string>()
  const visit = (value: unknown, depth: number) => {
    const block = object(value)
    if (depth > 32 || typeof block.callId !== 'string' || calls.has(block.callId)) return
    calls.add(block.callId)
    for (const item of imagesFromCall(block)) {
      const previous = found.get(item.key)
      found.set(item.key, previous ? { ...previous, reads: previous.reads + 1 } : item)
    }
    if (Array.isArray(block.subCalls)) block.subCalls.forEach(child => visit(child, depth + 1))
  }
  roots.forEach(root => visit(root, 0))
  return [...found.values()]
}
export function normalizedRegion(start: { x: number, y: number }, end: { x: number, y: number }): Region {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = Math.min(clamp(start.x), clamp(end.x)), y = Math.min(clamp(start.y), clamp(end.y))
  return { x, y, width: Math.abs(clamp(start.x) - clamp(end.x)), height: Math.abs(clamp(start.y) - clamp(end.y)) }
}
export function validRegion(value: unknown): value is Region {
  const r = object(value)
  return [r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) && r.width > 0 && r.height > 0 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001
}
export function feedbackText(image: ViewedImage, region: Region, note: string): string {
  const percent = (n: number) => `${(n * 100).toFixed(1)}%`
  return `[Image feedback / 图片反馈 — source event #${image.seq}]\n${image.path}\nAttachment: ${image.attachment.attachmentId} (${image.attachment.width}×${image.attachment.height})\nRegion / 区域: x=${percent(region.x)}, y=${percent(region.y)}, width=${percent(region.width)}, height=${percent(region.height)}\n${note}\n(References the image at read time; this text does not attach the image again. / 引用读取时版本，未重新附加图片。)`
}
export function validateEntry(value: unknown): NotebookEntry {
  const row = object(value)
  if (typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id)) throw new Error('Invalid note ID')
  if (!Number.isSafeInteger(row.seq) || row.seq < 0) throw new Error('Invalid source event')
  if (!['constraint', 'decision', 'question', 'annotation'].includes(row.kind)) throw new Error('Invalid note kind')
  for (const [key, max] of [['text', MAX_NOTE_TEXT], ['note', 4000], ['tags', 200]] as const) {
    if (typeof row[key] !== 'string' || row[key].length > max) throw new Error(`Invalid ${key}`)
  }
  if (!row.text.trim()) throw new Error('Empty note')
  if (row.kind === 'annotation' && (typeof row.attachmentId !== 'string' || !row.attachmentId || row.attachmentId.length > 512 || !validRegion(row.region))) throw new Error('Invalid annotation')
  if (row.supersedes !== undefined && (typeof row.supersedes !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.supersedes) || row.supersedes === row.id)) throw new Error('Invalid replacement')
  return { id: row.id, seq: row.seq, text: row.text, note: row.note, kind: row.kind, tags: row.tags, time: Date.now(), history: [], ...(row.kind === 'annotation' ? { attachmentId: row.attachmentId, region: row.region } : {}), ...(row.supersedes ? { supersedes: row.supersedes } : {}) }
}

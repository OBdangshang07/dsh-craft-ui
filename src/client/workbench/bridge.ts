import { emptyNotebook, type Notebook, type NotebookEntry } from '../../workbench.ts'

export interface NotebookState { data: Notebook, loading: boolean, error: string }
export class NotebookBridge {
  private state: NotebookState = { data: emptyNotebook(), loading: false, error: '' }
  private listeners = new Set<() => void>()
  private generation = 0
  private loaded = false
  private disposed = false
  constructor(private connection: any, readonly sessionId: string) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<NotebookState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn())
  }
  private async call(endpoint: string, payload = {}): Promise<any> {
    const result = await this.connection.rpc.call('/api', `craft-ui/notebook/${endpoint}`, { ...payload, sessionId: this.sessionId })
    if (!result.ok) throw new Error(result.error?.message || 'Notebook unavailable')
    return result.value
  }
  load = async (force = false) => {
    if (this.state.loading || this.disposed || this.loaded && !force) return
    const generation = ++this.generation
    this.publish({ loading: true, error: '' })
    try { const data = await this.call('read'); if (generation === this.generation) { this.loaded = true; this.publish({ data }) } }
    catch (error) { if (generation === this.generation) this.publish({ error: String(error) }) }
    finally { if (generation === this.generation) this.publish({ loading: false }) }
  }
  async mutate(action: 'save' | 'delete', entry: NotebookEntry | string) {
    if (this.state.loading || !this.loaded || this.disposed) throw new Error('Load the notebook before saving / 请先载入书签册')
    const generation = ++this.generation
    this.publish({ loading: true, error: '' })
    try {
      // Revision history is Host-owned. Sending it back grows requests on each
      // edit and can eventually exceed the bounded RPC body even for valid notes.
      const change = typeof entry === 'string' ? { id: entry } : { entry: { ...entry, history: [] } }
      const data = await this.call('mutate', { action, revision: this.state.data.revision, ...change })
      if (generation === this.generation) this.publish({ data })
    } catch (error) { if (generation === this.generation) this.publish({ error: String(error) }); throw error }
    finally { if (generation === this.generation) this.publish({ loading: false }) }
  }
  source(seq: number): Promise<{ seq: number, type: string, text: string, time: number, truncated: boolean }> { return this.call('source', { seq }) }
  dispose() { this.disposed = true; this.generation++; this.listeners.clear() }
}

/** Append atomically without touching reference chips or the user's selection. */
export function appendFeedback(actions: any, state: { draft: string, draftRev: number, phase: string }, text: string): boolean {
  if (!actions?.insertText || state.phase !== 'plain') return false
  return actions.insertText((state.draft ? '\n\n' : '') + text, { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }) === true
}

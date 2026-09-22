// Browser fixture only: synthetic adapter catalogs, no remote or model calls.
import { createRoot } from 'react-dom/client'
import { ReasoningControl } from '../src/client/components/ReasoningControl.tsx'
import type { ModelSelection, ModelState } from '../src/client/reasoning.ts'

const listeners = new Set<() => void>(), calls: ModelSelection[] = []
const levels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
let state: ModelState, fail = false
const update = (patch: Partial<ModelState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()) }
const setCase = (kind: string) => {
  const efforts = (kind === 'single' ? ['high'] : levels).map(id => ({ id, name: id.toUpperCase() }))
  const reasoning = kind === 'none' ? {} : { reasoning: { efforts, defaultEffort: 'high' } }
  update({ current: { provider: 'fixture', model: 'fixture', reasoningEffort: kind === 'unknown' ? 'unknown' : 'high' }, groups: [{ id: 'fixture', name: 'Fixture', models: [{ id: 'fixture', name: kind === 'long' ? 'Long provider/model name with extended context window' : 'Synthetic model', ...reasoning }, { id: 'fixture-b', name: 'Synthetic model B', ...reasoning }] }], failures: [], status: 'ready', error: null, routable: true })
}
setCase('six')
const directory = {
  store: { getSnapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } },
  load: () => Promise.resolve(state),
  select: async (selection: ModelSelection) => {
    calls.push(selection); update({ status: 'selecting' })
    await new Promise(resolve => setTimeout(resolve, 30))
    if (fail) { fail = false; update({ status: 'error', error: 'Simulated selection failure' }); return { ok: false, error: { message: 'Simulated selection failure' } } }
    update({ current: selection, status: 'ready', error: null }); return { ok: true }
  },
}
const root = document.createElement('div'); root.id = 'craft-reasoning-fixture'; root.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--craft-work-bg);padding:32px;display:flex;align-items:end;justify-content:end'
document.body.append(root)
createRoot(root).render(<ReasoningControl directory={directory} locked={false} available />)
Object.assign(window, { craftReasoningFixture: { setCase, calls: () => calls, failNext: () => { fail = true }, state: () => state } })

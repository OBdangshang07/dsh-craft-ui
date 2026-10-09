// Synthetic telemetry only; the surrounding composer and goal editor are real DSH.
import { createRoot } from 'react-dom/client'
import { CraftOverlay } from '../src/client/components/CraftOverlay.tsx'
import { setPreferences } from '../src/client/store.ts'

let busy = false
const list = { current: 'layout-fixture', byId: { 'layout-fixture': { id: 'layout-fixture', projectionValues: {
  contextPressure: { projectedTokens: 60000, contextWindow: 100000 },
  goal: { goal: { objective: 'Synthetic layout telemetry', phase: 'paused' } },
} } } }
const idleChat = { legacy: { nodes: [], runningCalls: [] } }
const busyChat = { legacy: { nodes: [], runningCalls: [{ callId: 'fixture-call', name: 'read_file' }] } }
const subscribe = () => () => {}
const host = document.createElement('div')
host.id = 'craft-layout-fixture'
document.body.append(host)
const root = createRoot(host)
// Stable snapshots are essential for useSyncExternalStore, including Session state.
const idleSession = { running: false }, busySession = { running: true }
const stableRender = () => root.render(<CraftOverlay
  useSessions={select => select(list)}
  sessions={{ binding: () => ({ session: { subscribe, getSnapshot: () => busy ? busySession : idleSession } }) }}
  uiConversation={{ binding: () => ({ target: () => ({ subscribe, getSnapshot: () => busy ? busyChat : idleChat }) }) }}
/>)
;(window as any).craftLayoutFixture = {
  busy: (value: boolean) => { busy = value; stableRender() },
  preferences: setPreferences,
  dispose: () => { root.unmount(); host.remove() },
}
stableRender()

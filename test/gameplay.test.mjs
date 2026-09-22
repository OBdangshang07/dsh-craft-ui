import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeConversation, normalizeSessionList, projectGameplay } from '../lib/client-gameplay.js'

test('0.1.7 mainView ownership selects only the visible session and clears stale selection', () => {
  const list = { current: 'old', byId: {
    old: { id: 'old', retainedBy: { gateway: 1 } },
    active: { id: 'active', retainedBy: { mainView: 1 } },
  } }
  assert.equal(normalizeSessionList(list).current, 'active')
  assert.equal(list.current, 'old')
  assert.equal(normalizeSessionList({ ...list, byId: { old: list.byId.old } }).current, undefined)
  assert.equal(normalizeSessionList({ byId: {} }).current, undefined)
  assert.equal(normalizeSessionList({ current: 'legacy', byId: { legacy: { id: 'legacy' } } }).current, 'legacy')
})

test('0.1.7 status, provider metadata and durable subagent catalog feed the HUD', () => {
  const statuses = new Map([
    ['root', { running: true, pendingInteraction: { kind: 'approval', key: 'a1' } }],
    ['child', { running: true }],
  ])
  const list = normalizeSessionList({ byId: {
    root: { id: 'root', retainedBy: { mainView: 1 }, projectionValues: {
      contextPressure: { projectedTokens: 60, contextWindow: 100 },
      subagentCatalog: [{ id: 'child', label: 'Builder', mode: 'continuable' }, { id: 'idle', mode: 'one-shot' }],
    } },
    child: { id: 'child', running: false, retainedBy: {} },
    idle: { id: 'idle', displayTitle: 'Completed helper', running: false, retainedBy: {} },
  } })
  const status = statuses.get('root')
  const conversation = normalizeConversation(status, { legacy: {
    runningCalls: [{ callId: 'call', name: 'read_file' }],
    nodes: [{ kind: 'assistant', providerMetadata: { provider: 'deepseek', model: 'model-from-host' } }],
  } }, Boolean(status.pendingInteraction))
  const view = projectGameplay(list, conversation, statuses)
  assert.equal(view.model, 'model-from-host')
  assert.equal(view.provider, 'deepseek')
  assert.equal(view.running, true)
  assert.equal(view.pending, 1)
  assert.equal(view.context.ratio, 0.6)
  assert.deepEqual(view.agents, [
    { id: 'child', label: 'Builder', running: true, mode: 'continuable' },
    { id: 'idle', label: 'Completed helper', running: false, mode: 'one-shot' },
  ])
  assert.deepEqual(view.tools, [{ callId: 'call', name: 'read_file' }])
  const settled = normalizeConversation({ running: false }, { legacy: {} }, false)
  const cleared = projectGameplay(list, settled, new Map([['child', { running: false }]]))
  assert.equal(cleared.pending, 0)
  assert.equal(cleared.running, false)
  assert.equal(cleared.agents[0].running, false)
  assert.deepEqual(cleared.tools, [])
})

test('adapts DSH 0.1.5 Session and Chat snapshots without losing gameplay state', () => {
  const conversation = normalizeConversation(
    { running: true, queue: [{ id: 'queued-1' }] },
    { legacy: { runningCalls: [{ callId: 'c1', name: 'exec_command' }], nodes: [{ kind: 'assistant', requestConfig: { model: 'deepseek-chat' } }] } },
    true,
  )
  assert.equal(conversation.running, true)
  assert.deepEqual(conversation.runningCalls, [{ callId: 'c1', name: 'exec_command' }])
  assert.equal(conversation.nodes[0].requestConfig.model, 'deepseek-chat')
  assert.equal(conversation.pending.length, 1)
})

test('projects real Harness session and projection fields into gameplay state', () => {
  const view = projectGameplay({
    current: 'root',
    byId: {
      root: {
        id: 'root',
        running: true,
        projectionValues: {
          contextPressure: { projectedTokens: 96_000, contextWindow: 128_000 },
          todos: [{ content: 'Implement importer', status: 'completed' }, { content: 'Build HUD', status: 'in_progress' }],
          plan: { active: true, pending: false },
          goal: { goal: { objective: 'Ship plugin', phase: 'active', maxGoalRounds: 20 }, roundsStarted: 5 },
        },
      },
    },
    subagentsByParent: { root: { entries: [{ kind: 'child', id: 'agent-1', label: 'UI worker', activity: 'running', mode: 'continuable' }] } },
  }, {
    running: true,
    pending: [{ kind: 'approval' }],
    runningCalls: [{ callId: 'c1', name: 'exec_command' }],
    nodes: [{ kind: 'assistant', requestConfig: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' } }],
  })
  assert.equal(view.context.ratio, 0.75)
  assert.equal(view.model, 'deepseek-reasoner')
  assert.equal(view.reasoning, 'high')
  assert.deepEqual(view.tools, [{ callId: 'c1', name: 'exec_command' }])
  assert.equal(view.todos[1].status, 'in_progress')
  assert.equal(view.planActive, true)
  assert.equal(view.goal.roundsStarted, 5)
  assert.equal(view.agents[0].label, 'UI worker')
  assert.equal(view.pending, 1)
})

test('clamps context ratio and rejects malformed projected todos', () => {
  const view = projectGameplay({ current: 's', byId: { s: { id: 's', projectionValues: { contextPressure: { pressureTokens: 200, contextWindow: 100 }, todos: [{ content: 42, status: 'pending' }] } } } })
  assert.equal(view.context.ratio, 1)
  assert.deepEqual(view.todos, [])
})

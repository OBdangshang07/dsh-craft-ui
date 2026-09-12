import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeConversation, projectGameplay } from '../lib/client-gameplay.js'

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

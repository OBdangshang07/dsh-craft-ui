import assert from 'node:assert/strict'
import test from 'node:test'
import { makeHotbarSlots, shortTool, toolItem } from '../lib/client-hotbar.js'

const empty = {
  context: { ratio: 0 }, tools: [], todos: [], planActive: false, agents: [], running: false, pending: 0,
}

test('maps Harness tool families to distinct Minecraft item semantics', () => {
  assert.equal(toolItem('exec_command'), 'pickaxe')
  assert.equal(toolItem('write_stdin'), 'pickaxe')
  assert.equal(toolItem('apply_patch'), 'axe')
  assert.equal(toolItem('read_mcp_resource'), 'compass')
  assert.equal(toolItem('web_browser'), 'eye')
  assert.equal(toolItem('view_image'), 'map')
  assert.equal(toolItem('spawn_agent'), 'agent')
  assert.equal(toolItem('update_goal'), 'totem')
  assert.equal(toolItem('update_plan'), 'book')
  assert.equal(toolItem('request_user_input'), 'paper')
  assert.equal(shortTool('mcp/server.exec_command'), 'EXEC COMM')
})

test('builds a stable nine-slot status bar from real gameplay state', () => {
  const slots = makeHotbarSlots({
    ...empty,
    model: 'deepseek-reasoner', provider: 'deepseek',
    tools: [{ callId: '1', name: 'exec_command' }, { callId: '2', name: 'apply_patch' }],
    todos: [{ content: 'Ship', status: 'in_progress' }],
    goal: { objective: 'Complete release', phase: 'active', roundsStarted: 2, maxGoalRounds: 8 },
    agents: [{ id: 'a', label: 'QA', running: true }], pending: 2,
  })
  assert.equal(slots.length, 9)
  assert.equal(slots[0].item, 'pickaxe')
  assert.equal(slots[1].item, 'axe')
  assert.equal(slots[4].item, 'star')
  assert.equal(slots[5].item, 'totem')
  assert.equal(slots[6].count, 1)
  assert.equal(slots[7].active, true)
  assert.equal(slots[8].count, 2)
})

test('returns an empty bar for an idle session without projected state', () => {
  assert.equal(makeHotbarSlots(empty).some(Boolean), false)
})

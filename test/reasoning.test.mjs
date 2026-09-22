import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { reasoningView, effortSelection, defaultSelection } from '../lib/client-reasoning.js'

const model = (ids = ['off', 'low', 'high', 'max'], extra = {}) => ({ id: 'example', name: 'Example', reasoning: { efforts: ids.map(id => ({ id, name: id.toUpperCase() })), defaultEffort: 'high', ...extra } })
const state = (row = model(), current = { provider: 'p', model: 'example', reasoningEffort: 'max' }) => ({ current, groups: [{ id: 'p', name: 'Provider', models: [row] }], status: 'ready', failures: [], error: null, routable: true })
test('reasoning slider preserves exact adapter IDs, names and order, with no fixed six-level vocabulary', () => {
  for (const levels of [['off', 'low', 'high', 'max'], ['minimal', 'low', 'medium', 'high', 'xhigh', 'ultra'], ['custom-token-budget']]) {
    const s = state(model(levels)), view = reasoningView(s)
    assert.deepEqual(view.levels.map(l => l.id), levels)
    assert.deepEqual(effortSelection(s, view.identity, 0), { provider: 'p', model: 'example', reasoningEffort: levels[0] })
  }
})
test('unadvertised models/efforts are not fabricated or silently normalized', () => {
  assert.equal(reasoningView(state({ id: 'example', name: 'Plain' })).levels.length, 0)
  const s = state(model(), { provider: 'p', model: 'example', reasoningEffort: 'unknown' })
  const view = reasoningView(s)
  assert.equal(view.index, -1); assert.equal(view.label, 'unknown')
  assert.equal(effortSelection(s, view.identity, -1), undefined)
  assert.equal(reasoningView(state(model(), { provider: 'missing', model: 'example' })).levels.length, 0)
})
test('default effort follows model metadata, including provider-owned default with no explicit ID', () => {
  const s = state(model(undefined, { defaultEffort: undefined }), { provider: 'p', model: 'example' }), view = reasoningView(s)
  assert.equal(view.index, 0); assert.equal(view.levels[0].name, 'Default')
  assert.deepEqual(effortSelection(s, view.identity, 0), { provider: 'p', model: 'example' })
  assert.deepEqual(defaultSelection('p', model()), { provider: 'p', model: 'example', reasoningEffort: 'high' })
})
test('catalog/session/current-effort changes invalidate in-progress slider gestures', () => {
  const original = state(), identity = reasoningView(original).identity
  for (const changed of [state(model(), { provider: 'other', model: 'example' }), state(model(), { provider: 'p', model: 'example', reasoningEffort: 'low' }), state(model(['off', 'high'])), { ...original, status: 'selecting' }, { ...original, status: 'loading' }]) assert.equal(effortSelection(changed, identity, 1), undefined)
  for (const index of [-1, .5, 4, NaN]) assert.equal(effortSelection(original, identity, index), undefined)
})
test('slider defaults on for existing preferences and legacy restores upstream slot instead of imitating it', async () => {
  const types = await readFile(new URL('../src/client/types.ts', import.meta.url), 'utf8')
  const store = await readFile(new URL('../src/client/store.ts', import.meta.url), 'utf8')
  const control = await readFile(new URL('../src/client/components/ReasoningControl.tsx', import.meta.url), 'utf8')
  assert.match(types, /reasoningControl: 'slider'/)
  assert.match(store, /\.\.\.DEFAULT_PREFERENCES, \.\.\.row/)
  assert.match(control, /conversation\.input\.model.*priority: -100/)
  assert.match(control, /remove\?\.\(\); remove = undefined/)
  assert.match(control, /'modelDirectories', 'sessions', 'remote', 'remote\.session'/)
  assert.doesNotMatch(control, /rpc\.call|submit\(/)
})

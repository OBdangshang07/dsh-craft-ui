import assert from 'node:assert/strict'
import test from 'node:test'
import { collectImages, imagesFromCall, normalizedRegion, validRegion, validateEntry, feedbackText } from '../lib/workbench.js'
import { appendFeedback, NotebookBridge } from '../lib/notebook-bridge.js'

const image = { attachmentId: 'opaque-image-1', mediaType: 'image/png', bytes: 20, width: 320, height: 240 }
const call = (id = 'read-1', ref = image) => ({ kind: 'tool-result', seq: 8, time: 1, callId: id, call: { name: 'read_image', argsRaw: JSON.stringify({ file_path: 'H:\\图片\\房屋.png' }) }, isError: false, content: [{ type: 'text', text: 'Image read' }, { type: 'image', attachment: ref }], subCalls: [] })
test('only successful settled image tools produce previews; opaque references are preserved', () => {
  assert.equal(imagesFromCall(call())[0].attachment.attachmentId, image.attachmentId)
  for (const bad of [{ ...call(), isError: true }, { ...call(), kind: undefined }, { ...call(), call: { name: 'bash', argsRaw: '{}' } }, { ...call(), call: { name: 'read_image', argsRaw: '{' } }, { ...call(), content: [{ type: 'text', text: 'C:/image.png' }] }]) assert.deepEqual(imagesFromCall(bad), [])
})
test('image admission fails closed for malformed refs, unsupported media and decoding bombs', () => {
  for (const patch of [{ width: -1 }, { height: Infinity }, { attachmentId: '' }, { mediaType: 'image/svg+xml' }, { width: 50000, height: 50000 }]) assert.deepEqual(imagesFromCall(call('x', { ...image, ...patch })), [])
  assert.deepEqual(imagesFromCall({ ...call(), content: [...call().content, { type: 'image', attachment: {} }] }), [])
})
test('nested calls deduplicate by immutable content, never by file path or duplicate replay', () => {
  const a = call(), b = call('read-2'), c = call('read-3', { ...image, attachmentId: 'new-content' })
  const rows = collectImages([{ callId: 'run-code', subCalls: [a, b, c] }, a])
  assert.equal(rows.length, 2); assert.equal(rows[0].reads, 2); assert.equal(rows[1].reads, 1)
  assert.equal(collectImages(Array.from({ length: 20 }, (_, i) => call(`read-${i}`, { ...image, attachmentId: `image-${i}` }))).length, 20)
})
test('annotation geometry clamps and normalizes reverse drags; zero/invalid areas rejected', () => {
  assert.deepEqual(normalizedRegion({ x: .9, y: .8 }, { x: -.2, y: 1.4 }), { x: 0, y: .8, width: .9, height: .19999999999999996 })
  assert.equal(validRegion({ x: .9, y: 0, width: .2, height: .3 }), false)
  assert.equal(validRegion({ x: 0, y: 0, width: 0, height: 1 }), false)
  assert.equal(validRegion({ x: 0, y: 0, width: 1, height: 1 }), true)
  assert.match(feedbackText(imagesFromCall(call())[0], { x: .1, y: .2, width: .3, height: .4 }, '移动这里'), /10\.0%/)
})
test('draft insertion appends with revision CAS without replacing selected text or calling submit', () => {
  let received
  const actions = { insertText: (text, span) => { received = { text, span }; return true }, setDraft: () => assert.fail('Must not replace draft'), submit: () => assert.fail('Must not submit') }
  assert.equal(appendFeedback(actions, { draft: '保留 @file', draftRev: 7, phase: 'plain' }, 'feedback'), true)
  assert.deepEqual(received, { text: '\n\nfeedback', span: { start: 8, end: 8, draftRev: 7 } })
  assert.equal(appendFeedback(actions, { draft: '', draftRev: 8, phase: 'submitting' }, 'x'), false)
  assert.equal(appendFeedback({ insertText: () => false }, { draft: '', draftRev: 8, phase: 'plain' }, 'x'), false)
})
test('notes reject missing source, oversize text, invalid replacement and invalid regions', () => {
  const row = { id: 'note-1', seq: 0, text: '原文', note: '', kind: 'decision', tags: '' }
  assert.equal(validateEntry(row).seq, 0)
  for (const patch of [{ id: '../escape' }, { seq: -1 }, { text: '' }, { text: 'x'.repeat(8001) }, { supersedes: 'note-1' }, { kind: 'annotation' }]) assert.throws(() => validateEntry({ ...row, ...patch }))
})
test('notebook bridge requires loaded state, preserves errors, and isolates session identity', async () => {
  const requests = []
  const bridge = new NotebookBridge({ rpc: { call: async (_carrier, method, payload) => { requests.push({ method, payload }); return { ok: true, value: { schema: 1, revision: 2, entries: [] } } } } }, 'session-A')
  await assert.rejects(bridge.mutate('delete', 'x'))
  await bridge.load(); await bridge.mutate('delete', 'x')
  assert.equal(requests[1].payload.revision, 2); assert.equal(requests[1].payload.sessionId, 'session-A')
  await bridge.mutate('save', { id: 'note-1', seq: 1, text: 'source', kind: 'decision', note: '', tags: '', history: Array.from({ length: 20 }, () => ({ text: 'x'.repeat(8000), note: '' })) })
  assert.deepEqual(requests[2].payload.entry.history, [])
  bridge.dispose(); assert.equal(bridge.getSnapshot().loading, false)
})
test('offline notebook errors retain last known notes without pretending the write succeeded', async () => {
  let offline = false
  const data = { schema: 1, revision: 3, entries: [{ id: 'retained' }] }
  const bridge = new NotebookBridge({ rpc: { call: async () => { if (offline) throw new Error('offline'); return { ok: true, value: data } } } }, 'session-A')
  await bridge.load(); offline = true
  await assert.rejects(bridge.mutate('delete', 'retained'), /offline/)
  assert.equal(bridge.getSnapshot().data, data)
  assert.equal(bridge.getSnapshot().loading, false)
  await bridge.load(true)
  assert.match(bridge.getSnapshot().error, /offline/)
  assert.equal(bridge.getSnapshot().data.revision, 3)
  bridge.dispose()
})

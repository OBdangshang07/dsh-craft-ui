import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mutateNotebook, readNotebook, notebookFile, sourceText } from '../lib/notebook.js'
import { apply } from '../lib/index.js'

const entry = (patch = {}) => ({ id: 'note-1', seq: 4, kind: 'decision', text: 'Use original UI', note: '', tags: '', ...patch })
test('notebook persists across readers, retains revisions and uses opaque bounded filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-notes-'))
  assert.equal(dirname(notebookFile(root, '../../session')), root)
  const first = await mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: entry() })
  assert.equal(first.revision, 1)
  await mutateNotebook(root, 'S', { revision: 1, action: 'save', entry: entry({ note: 'Use Java layout' }) })
  const stored = await readNotebook(root, 'S')
  assert.equal(stored.entries[0].history.length, 1); assert.equal(stored.entries[0].note, 'Use Java layout')
  assert.equal((await readNotebook(root, 'other')).entries.length, 0)
  assert.deepEqual((await readdir(root)).filter(name => /\.lock|\.tmp/.test(name)), [])
})
test('concurrent writes reject stale revisions rather than silently losing notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-cas-'))
  const results = await Promise.allSettled([1, 2].map(n => mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: entry({ id: `note-${n}` }) })))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal((await readNotebook(root, 'S')).revision, 1)
})
test('damaged storage and unknown schemas are preserved, not reset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-corrupt-')), file = notebookFile(root, 'S')
  await writeFile(file, '{bad')
  await assert.rejects(mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: entry() }))
  assert.equal(await readFile(file, 'utf8'), '{bad')
  await writeFile(file, JSON.stringify({ schema: 2, revision: 0, entries: [] }))
  await assert.rejects(readNotebook(root, 'S'))
})
test('replacements preserve old cards, reject cycles and prevent source mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-history-'))
  await mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: entry() })
  await mutateNotebook(root, 'S', { revision: 1, action: 'save', entry: entry({ id: 'note-2', supersedes: 'note-1' }) })
  await assert.rejects(mutateNotebook(root, 'S', { revision: 2, action: 'save', entry: entry({ supersedes: 'note-2' }) }), /cycle/)
  await assert.rejects(mutateNotebook(root, 'S', { revision: 2, action: 'save', entry: entry({ seq: 99 }) }), /source/)
  assert.equal((await readNotebook(root, 'S')).entries.length, 2)
})
test('source presentation excludes system messages and reasoning', () => {
  assert.throws(() => sourceText({ type: 'system/message', data: { content: [{ type: 'text', text: 'secret' }] } }))
  assert.equal(sourceText({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'reply' }, { type: 'reasoning', text: 'hidden' }] } } }), 'reply')
})
test('annotation edits retain their old geometry and damaged history is not rewritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-regions-')), region = { x: .1, y: .2, width: .3, height: .4 }
  const annotation = entry({ kind: 'annotation', attachmentId: 'image-a', region })
  await mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: annotation })
  await mutateNotebook(root, 'S', { revision: 1, action: 'save', entry: { ...annotation, region: { ...region, x: .3 } } })
  const stored = await readNotebook(root, 'S')
  assert.deepEqual(stored.entries[0].history[0].region, region)
  stored.entries[0].history[0].note = null
  const file = notebookFile(root, 'S'), body = JSON.stringify(stored)
  await writeFile(file, body)
  await assert.rejects(mutateNotebook(root, 'S', { revision: 2, action: 'save', entry: annotation }))
  assert.equal(await readFile(file, 'utf8'), body)
})
test('storage IO failures and crash locks preserve the existing notebook', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-lock-')), file = notebookFile(root, 'S')
  await mutateNotebook(root, 'S', { revision: 0, action: 'save', entry: entry() })
  const before = await readFile(file, 'utf8')
  await writeFile(file + '.lock', 'crash simulation')
  await assert.rejects(mutateNotebook(root, 'S', { revision: 1, action: 'delete', id: 'note-1' }), /busy/)
  assert.equal(await readFile(file, 'utf8'), before)
  assert.equal(await readFile(file + '.lock', 'utf8'), 'crash simulation')
  const notDirectory = join(root, 'not-a-directory')
  await writeFile(notDirectory, 'do not overwrite')
  await assert.rejects(mutateNotebook(notDirectory, 'S', { revision: 0, action: 'save', entry: entry() }))
  assert.equal(await readFile(notDirectory, 'utf8'), 'do not overwrite')
})
test('authenticated notebook routes verify source and session before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'craft-routes-')), routes = new Map()
  apply({ profileContext: { dir: root }, connection: { fetch: { register: route => routes.set(route.path, route) } }, sessionQuery: {
    readTitleSnapshots: async ids => [{ status: ids[0] === 'allowed' ? 'fulfilled' : 'rejected' }],
    readEvent: async ({ seq }) => ({ target: { seq, type: 'user/message', data: { content: [{ type: 'text', text: 'Use original UI' }] } } }),
  } }, { dshHome: root, allowLocalOfficialAssets: false })
  const rpc = async (method, payload) => { const res = await routes.get(`/api/craft-ui/notebook/${method}`).fetch(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'r', method: `craft-ui/notebook/${method}`, payload }) })); return (await res.json()).result }
  assert.equal((await rpc('read', { sessionId: 'denied' })).ok, false)
  assert.equal((await rpc('mutate', { sessionId: 'allowed', revision: 0, action: 'save', entry: entry({ text: 'Invented text' }) })).ok, false)
  assert.equal((await rpc('mutate', { sessionId: 'allowed', revision: 0, action: 'save', entry: entry() })).ok, true)
  assert.equal((await rpc('source', { sessionId: 'allowed', seq: 4 })).value.text, 'Use original UI')
  assert.equal((await rpc('mutate', { sessionId: 'allowed', revision: 1, action: 'save', entry: entry({ kind: 'annotation', attachmentId: 'unknown', region: { x: 0, y: 0, width: 1, height: 1 } }) })).ok, false)
})

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../lib/index.js'

test('resource routes use the authenticated API carrier and preserve RPC results', async () => {
  const routes = new Map()
  apply({ connection: { fetch: { register: route => routes.set(route.path, route) } } }, {
    dshHome: join(tmpdir(), `craft-unused-${randomUUID()}`), allowLocalOfficialAssets: false,
  })
  const request = (endpoint, payload = {}, overrides = {}) => new Request(`http://localhost/api/craft-ui/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'test-id', method: `craft-ui/${endpoint}`, payload, ...overrides }),
  })
  for (const route of routes.values()) {
    assert.ok(route.path.startsWith('/api/craft-ui/'))
    assert.deepEqual(route.methods, ['POST'])
    assert.equal(route.requestBody, 'buffered')
  }
  const status = await routes.get('/api/craft-ui/status').fetch(request('status'))
  const envelope = await status.json()
  assert.equal(status.status, 200)
  assert.equal(envelope.type, 'server-response')
  assert.equal(envelope.rpcId, 'test-id')
  assert.equal(envelope.result.ok, true)
  assert.equal(envelope.result.value.active, false)
  for (const endpoint of ['import', 'import-items']) {
    const response = await routes.get(`/api/craft-ui/${endpoint}`).fetch(request(endpoint, { path: 'not-used' }))
    assert.equal((await response.json()).result.error.code, 'forbidden')
  }
  const wrongMethod = await routes.get('/api/craft-ui/status').fetch(request('status', {}, { method: 'craft-ui/clear' }))
  assert.equal(wrongMethod.status, 400)
  const malformed = await routes.get('/api/craft-ui/status').fetch(new Request('http://localhost/api/craft-ui/status', { method: 'POST', body: '{' }))
  assert.equal(malformed.status, 400)
})

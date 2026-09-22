import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('declares every DSH 0.1.5 service read by the client', async () => {
  const source = await readFile(join(root, 'src/client/index.tsx'), 'utf8')
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.match(source, /export const inject = \['slots', 'theme', 'connection', 'sessions', 'uiSession', 'uiConversation'\]/)
  for (const dependency of [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-chat',
  ]) assert.ok(manifest.dsh.client.inject.includes(dependency), `missing client dependency ${dependency}`)
})

test('normalizes the split Session, Chat, and pending-interaction feeds', async () => {
  const source = await readFile(join(root, 'src/client/components/CraftOverlay.tsx'), 'utf8')
  assert.match(source, /uiConversation\.binding\(binding\)/)
  assert.match(source, /chatBinding\?\.target\('chat'\)/)
  assert.match(source, /uiSession\?\.sessionStatus/)
  assert.match(source, /status\?\.pendingInteraction/)
  assert.match(source, /normalizeSessionList\(useSessions/)
})

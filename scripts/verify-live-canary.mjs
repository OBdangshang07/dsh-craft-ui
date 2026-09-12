import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const logPath = process.argv[2] ? resolve(process.argv[2]) : join(root, '.generated', 'live-canary.log')
const log = await readFile(logPath, 'utf8')
const targetUrl = log.match(/https?:\/\/127\.0\.0\.1:\d+\/\?\S+/)?.[0]
if (!targetUrl) throw new Error('Authenticated Harness URL was not found in the canary log')

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const debuggingPort = 39229
const browserProfile = join(root, '.generated', `edge-live-${Date.now()}`)
await mkdir(browserProfile, { recursive: true })
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${browserProfile}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

try {
  await waitForBrowser()
  const target = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?${targetUrl}`, { method: 'PUT' }).then(response => response.json())
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params?.exceptionDetails ?? {}))
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') errors.push(message.params.entry.text ?? 'unknown log error')
    if (!message.id) return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result)
  })
  const call = (method, params = {}) => new Promise((resolveCall, reject) => {
    const callId = ++id
    pending.set(callId, { resolve: resolveCall, reject })
    socket.send(JSON.stringify({ id: callId, method, params }))
  })
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Log.enable')
  await waitForExpression(call, `document.readyState === 'complete'`)
  await delay(800)
  await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '继续'))?.click()` })
  await waitForExpression(call, `Boolean(document.querySelector('button[title="DSH Craft UI"]'))`, 30000)
  const before = await evaluate(call, `({
    failedLoader: document.body.innerText.includes('Failed to load plugins'),
    button: Boolean(document.querySelector('button[title="DSH Craft UI"]')),
    style: Boolean(document.querySelector('style[data-plugin="dsh-craft-ui"]')),
    enabled: document.body.classList.contains('craft-ui-enabled'),
    composer: Boolean(document.querySelector('[data-composer-card]'))
  })`)
  await call('Runtime.evaluate', { expression: `document.querySelector('button[title="DSH Craft UI"]')?.click()` })
  await waitForExpression(call, `Boolean(document.querySelector('.craft-control-panel'))`)
  const after = await evaluate(call, `({ panel: Boolean(document.querySelector('.craft-control-panel')) })`)
  const pluginErrors = errors.filter(error => /craft-ui|dsh-craft|cannot get property/i.test(error))
  const result = { ...before, ...after, pluginErrors: pluginErrors.length }
  if (Object.entries(result).some(([key, value]) => key === 'failedLoader' ? value !== false : key === 'pluginErrors' ? value !== 0 : value !== true)) {
    throw new Error(`Live compatibility contract failed: ${JSON.stringify(result)} ${pluginErrors.join('\n')}`)
  }
  console.log(`live compatibility verified: ${JSON.stringify(result)}`)
  socket.close()
} finally {
  browser.kill()
}

async function waitForBrowser() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)
      if (response.ok) return
    } catch {}
    await delay(100)
  }
  throw new Error('Headless Edge did not expose its debugging endpoint')
}

async function waitForExpression(call, expression, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await evaluate(call, expression)
    if (value) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}

async function evaluate(call, expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Runtime evaluation failed')
  return response.result.value
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

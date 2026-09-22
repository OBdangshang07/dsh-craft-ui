import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const logPath = process.argv[2] ? resolve(process.argv[2]) : join(root, '.generated', 'live-canary.log')
let targetUrl
const startupDeadline = Date.now() + 45_000
while (!targetUrl && Date.now() < startupDeadline) {
  const log = await readFile(logPath, 'utf8').catch(() => '')
  targetUrl = log.match(/https?:\/\/127\.0\.0\.1:\d+\/\?\S+/)?.[0]
  if (!targetUrl) await delay(250)
}
if (!targetUrl) throw new Error('Authenticated Harness URL was not found in the canary log')

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const debuggingPort = 39229
const browserProfile = join(root, '.generated', `edge-live-${Date.now()}`)
const captureDirectory = join(root, '.generated', 'compatibility-captures')
await mkdir(browserProfile, { recursive: true })
await mkdir(captureDirectory, { recursive: true })
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${browserProfile}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

let socket
try {
  await waitForBrowser()
  const target = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json())
  socket = new WebSocket(target.webSocketDebuggerUrl)
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
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params?.type)) errors.push((message.params.args ?? []).map(arg => arg.value ?? arg.description ?? '').join(' '))
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
  await call('Page.navigate', { url: targetUrl })
  await waitForExpression(call, `document.readyState === 'complete'`)
  await delay(800)
  await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '继续'))?.click()` })
  await waitForExpression(call, `Boolean(document.querySelector('button[title="DSH Craft UI"]'))`, 30000)
  await delay(500)
  await evaluate(call, `([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '稍后配置'))?.click()`)
  await delay(250)
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
  await capture(call, 'options-night')
  await clickText(call, '世界主题:', true)
  await waitForExpression(call, `document.body.dataset.craftTheme === 'craft-day'`)
  await capture(call, 'options-day')
  await clickText(call, '世界主题:', true)
  await waitForExpression(call, `document.body.dataset.craftTheme === 'craft-deepslate'`)
  await clickText(call, 'HUD 与玩法设置…')
  await waitForExpression(call, `Boolean(document.querySelector('.craft-options-gameplay'))`)
  await capture(call, 'options-gameplay')
  await clickText(call, '返回')
  await clickText(call, '素材与资源包…')
  await waitForExpression(call, `Boolean(document.querySelector('.craft-resource-screen'))`)
  const resources = await evaluate(call, `({ errors: [...document.querySelectorAll('.craft-error')].map(node => node.textContent), inputEnabled: !document.querySelector('.craft-path-label input')?.disabled })`)
  // Exercise the real authenticated Host RPC, without importing or clearing assets.
  const rpc = await evaluate(call, `(async () => {
    const response = await fetch('api/craft-ui/status', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({type:'client-request', method:'craft-ui/status', rpcId:'craft-compat-status', payload:{}}) });
    return { status: response.status, body: await response.text() };
  })()`, true)
  if (rpc.status !== 200 || !JSON.parse(rpc.body).result?.ok) throw new Error(`Resource RPC failed: ${JSON.stringify(rpc)}; panel: ${JSON.stringify(resources)}`)
  if (resources.errors.length || !resources.inputEnabled) throw new Error(`Resource panel failed: ${JSON.stringify(resources)}`)
  await capture(call, 'options-assets')
  await call('Emulation.setDeviceMetricsOverride', { width: 640, height: 900, deviceScaleFactor: 1, mobile: false })
  await delay(150)
  const narrow = await evaluate(call, `(() => { const r = document.querySelector('.craft-control-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })()`)
  if (!narrow) throw new Error('Settings panel overflows the narrow viewport')
  await capture(call, 'options-narrow')
  await clickText(call, '返回')
  await clickText(call, '完成')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  const typography = await evaluate(call, `(() => { const input = document.querySelector('[data-composer-card] [contenteditable="true"], [data-composer-card] textarea'); if (!input) return null; const s = getComputedStyle(input); input.focus(); return {font:s.fontFamily, size:s.fontSize, line:s.lineHeight}; })()`)
  if (!typography?.font.includes('Craft Pixel') || typography.size !== '16px' || typography.line !== '16px') throw new Error(`Composer font mismatch: ${JSON.stringify(typography)}`)
  await waitForExpression(call, `Boolean(document.activeElement?.closest('[data-composer-card]'))`)
  await call('Input.insertText', { text: 'Minecraft 字体输入测试 abc123' })
  await delay(150)
  await waitForExpression(call, `(() => { const input = document.querySelector('[data-composer-card] [contenteditable="true"], [data-composer-card] textarea'); return (input?.value ?? input?.textContent ?? '').includes('Minecraft 字体输入测试 abc123'); })()`)
  await capture(call, 'composer-font')
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  const pluginErrors = errors.filter(error => /craft-ui|dsh-craft|cannot get property/i.test(error))
  const result = { ...before, ...after, themes: true, resources: true, narrow, typography: true, pluginErrors: pluginErrors.length }
  if (Object.entries(result).some(([key, value]) => key === 'failedLoader' ? value !== false : key === 'pluginErrors' ? value !== 0 : value !== true)) {
    throw new Error(`Live compatibility contract failed: ${JSON.stringify(result)} ${pluginErrors.join('\n')}`)
  }
  console.log(`live compatibility verified: ${JSON.stringify(result)}`)
  socket.close()
} finally {
  socket?.close()
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

async function evaluate(call, expression, awaitPromise = false) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Runtime evaluation failed')
  return response.result.value
}

async function clickText(call, text, prefix = false) {
  const clicked = await evaluate(call, `(() => { const button = [...document.querySelectorAll('.craft-control-panel button')].find(node => ${prefix ? `node.textContent.trim().startsWith(${JSON.stringify(text)})` : `node.textContent.trim() === ${JSON.stringify(text)}`}); button?.click(); return Boolean(button); })()`)
  if (!clicked) throw new Error(`Missing Craft UI button: ${text}`)
  await delay(120)
}

async function capture(call, name) {
  await delay(250)
  if (name.startsWith('options-')) {
    const visible = await evaluate(call, `(() => {
      const panel = document.querySelector('.craft-control-panel');
      const shade = document.querySelector('.craft-panel-shade');
      if (!panel || !shade) return false;
      const r = shade.getBoundingClientRect();
      const button = panel.querySelector('button:not(:disabled)');
      const b = button.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && Number(getComputedStyle(shade).opacity) === 1 && Boolean(hit?.closest('.craft-control-panel'));
    })()`)
    if (!visible) throw new Error(`Options screen is clipped or covered: ${name}`)
  }
  const shot = await call('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(captureDirectory, `${name}.png`), Buffer.from(shot.data, 'base64'))
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

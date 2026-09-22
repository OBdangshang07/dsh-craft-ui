import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// An isolated headless browser: no user tabs, drafts, or running jobs are touched.
export async function withCanaryBrowser(logPath, run) {
  const root = resolve(import.meta.dirname, '..')
  const generated = join(root, '.generated')
  await mkdir(generated, { recursive: true })
  const profile = await mkdtemp(join(generated, 'edge-controls-'))
  let targetUrl
  for (const deadline = Date.now() + 45000; !targetUrl && Date.now() < deadline;) {
    const log = await readFile(resolve(logPath), 'utf8').catch(() => '')
    targetUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?[^\s\x1b]+/)?.[0]
    if (!targetUrl) await delay(150)
  }
  if (!targetUrl) throw new Error('No authenticated URL in the supplied canary log')
  const browser = spawn(process.env.CRAFT_TEST_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
  ], { stdio: 'ignore' })
  let socket
  const pending = new Map()
  try {
    let port
    for (const deadline = Date.now() + 15000; !port && Date.now() < deadline;) {
      port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split('\n')[0]
      if (!port) await delay(100)
    }
    if (!port) throw new Error('Headless browser did not become ready')
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json())
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    const errors = []
    let nextId = 0
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '))
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      clearTimeout(waiter.timer)
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result)
    })
    const call = (method, params = {}) => new Promise((resolveCall, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser timeout: ${method}`)) }, 20000)
      pending.set(id, { resolve: resolveCall, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    }
    const waitFor = async (expression, timeout = 20000) => {
      for (const deadline = Date.now() + timeout; Date.now() < deadline;) {
        if (await evaluate(expression)) return
        await delay(100)
      }
      throw new Error(`Condition not met: ${expression}`)
    }
    const clickText = async text => {
      const clicked = await evaluate(`(() => { const el = [...document.querySelectorAll('button,[role="menuitem"]')].find(e => e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}); el?.click(); return Boolean(el) })()`)
      if (!clicked) throw new Error(`Missing control: ${text}`)
      await delay(180)
    }
    const capture = async (name, selector) => {
      const out = join(generated, 'native-controls')
      await mkdir(out, { recursive: true })
      const clip = selector ? await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.max(0,r.x-2),y:Math.max(0,r.y-2),width:Math.min(innerWidth-Math.max(0,r.x-2),r.width+8),height:Math.min(innerHeight-Math.max(0,r.y-2),r.height+8),scale:1}})()`) : undefined
      const shot = await call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) })
      await writeFile(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'))
    }
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Page.navigate', { url: targetUrl })
    await waitFor('document.readyState === "complete"')
    await delay(800)
    await evaluate(`([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '继续'))?.click()`)
    await waitFor(`!!document.querySelector('button[title="DSH Craft UI"]')`, 30000)
    await delay(600)
    await evaluate(`([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '稍后配置'))?.click()`)
    await run({ call, evaluate, waitFor, clickText, capture, errors })
  } finally {
    for (const waiter of pending.values()) clearTimeout(waiter.timer)
    socket?.close()
    browser.kill()
  }
}

export const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

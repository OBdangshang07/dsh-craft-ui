import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const root = resolve(import.meta.dirname, '..')
const output = join(root, '.generated', 'preview')
const browserProfile = join(root, '.generated', 'edge-cdp')
const port = 39227
const targetWorkspace = process.env.CRAFT_TEST_WORKSPACE ?? 'ds_Video'
const targetSession = process.env.CRAFT_TEST_SESSION ?? '视觉模型多模态能力确认'
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${browserProfile}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })

try {
  await waitForBrowser()
  const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:31873/`, { method: 'PUT' }).then(response => response.json())
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let id = 0
  const pending = new Map()
  const pluginErrors = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = JSON.stringify(message.params?.exceptionDetails ?? {})
      if (/craft-ui|dsh-craft|client\.js/i.test(detail)) pluginErrors.push(detail)
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error' && /craft-ui|dsh-craft/i.test(message.params.entry.text ?? '')) pluginErrors.push(message.params.entry.text)
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
  await delay(1200)
  await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('button')].find(button => button.textContent?.trim() === '继续'))?.click()` })
  try {
    await waitForExpression(call, `Boolean(document.querySelector('button[title="DSH Craft UI"]'))`, 30000)
  } catch (error) {
    const diagnostic = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ title: document.title, text: document.body?.innerText?.slice(0, 1200), html: document.body?.innerHTML?.slice(0, 1600) })` })
    throw new Error(`${error.message}\n${diagnostic.result.value}`)
  }
  const itemTextures = process.env.CRAFT_ITEM_TEXTURES
  if (itemTextures && (process.env.CRAFT_REIMPORT_ITEMS === '1' || !await evaluateBoolean(call, `document.body.dataset.craftItems === 'local'`))) {
    await call('Runtime.evaluate', { expression: `document.querySelector('button[title="DSH Craft UI"]')?.click()` })
    await waitForExpression(call, `Boolean(document.querySelector('.craft-control-panel'))`)
    await clickText(call, '素材与资源包…')
    await delay(250)
    await call('Runtime.evaluate', { expression: `(() => { const input = document.querySelector('.craft-path-label input'); if (!input) return; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(itemTextures)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()` })
    await delay(150)
    await clickText(call, '导入此资源包')
    await waitForExpression(call, `document.body.dataset.craftItems === 'local'`, 15000)
    await clickText(call, '返回')
    await delay(150)
    await clickText(call, '完成')
    await delay(300)
  }
  const diagnostics = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ bodyClass: document.body.className, bodyData: {...document.body.dataset}, bodyStyle: document.body.getAttribute('style'), bgToken: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base'), bodyBackground: getComputedStyle(document.body).backgroundColor, firstBackground: getComputedStyle(document.body.firstElementChild).backgroundColor })` })
  console.log(diagnostics.result.value)
  const workspaceAvailable = await evaluateBoolean(call, `[...document.querySelectorAll('*')].some(element => element.textContent?.trim() === ${JSON.stringify(targetWorkspace)})`)
  if (workspaceAvailable) {
    if (!await evaluateBoolean(call, `[...document.querySelectorAll('button')].some(element => element.textContent?.trim() === ${JSON.stringify(targetWorkspace)})`)) {
      await call('Runtime.evaluate', { expression: `(() => { const card = document.querySelector('[data-composer-card]')?.getBoundingClientRect(); if (!card) return; const button = [...document.querySelectorAll('button')].map(element => ({ element, rect: element.getBoundingClientRect() })).filter(entry => entry.rect.left >= card.left && entry.rect.bottom <= card.top && entry.rect.bottom >= card.top - 80).sort((a, b) => a.rect.left - b.rect.left)[0]?.element; button?.click(); })()` })
      await delay(250)
    }
    if (await evaluateBoolean(call, `[...document.querySelectorAll('[role="menuitem"]')].some(element => element.textContent?.trim() === ${JSON.stringify(targetWorkspace)})`)) {
      await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('[role="menuitem"]')].find(element => element.textContent?.trim() === ${JSON.stringify(targetWorkspace)}))?.click()` })
    } else {
      await clickText(call, targetWorkspace)
    }
    await delay(500)
    await call('Runtime.evaluate', { expression: `(() => { if ([...document.querySelectorAll('*')].some(element => element.textContent?.trim() === ${JSON.stringify(targetSession)})) return; const row = [...document.querySelectorAll('[role="treeitem"]')].find(element => element.textContent?.trim() === ${JSON.stringify(targetWorkspace)}); row?.click(); })()` })
    await delay(300)
  }
  const composerTypography = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify([...document.querySelectorAll('[data-composer-card] textarea,[data-composer-card] input,[data-composer-card] [contenteditable="true"],[data-composer-card] [role="textbox"]')].map(element => { const style = getComputedStyle(element); const cardStyle = getComputedStyle(element.closest('[data-composer-card]')); return { tag: element.tagName, className: element.className, contentEditable: element.getAttribute('contenteditable'), role: element.getAttribute('role'), fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, color: style.color, textFillColor: style.webkitTextFillColor, filter: style.filter, cardFilter: cardStyle.filter, textShadow: style.textShadow, caretColor: style.caretColor } }))` })
  console.log(`composer typography: ${composerTypography.result.value}`)
  const composerLayers = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const input = document.querySelector('[data-composer-card] textarea'); return JSON.stringify([...input.parentElement.children].map(node => { const style = getComputedStyle(node); return { tag: node.tagName, fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, textFillColor: style.webkitTextFillColor }; })); })()` })
  console.log(`composer layers: ${composerLayers.result.value}`)
  const contextMeters = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify([...document.querySelectorAll('[data-composer-card] button[aria-haspopup="dialog"]')].map(button => ({ ariaLabel: button.getAttribute('aria-label'), expanded: button.getAttribute('aria-expanded'), parent: button.parentElement?.outerHTML?.slice(0, 1200), grandparent: button.parentElement?.parentElement?.outerHTML?.slice(0, 1800) })))` })
  console.log(`context meters: ${contextMeters.result.value}`)
  const typographyRows = JSON.parse(composerTypography.result.value)
  const composerLayerRows = JSON.parse(composerLayers.result.value)
  if (typographyRows.length === 0 || typographyRows.some(row => !row.fontFamily.startsWith('"Craft Pixel"') || row.fontSize !== '16px' || row.lineHeight !== '16px' || row.filter !== 'none' || row.cardFilter !== 'opacity(1)' || row.textShadow !== 'none')) throw new Error(`Composer typography contract failed: ${composerTypography.result.value}`)
  if (composerLayerRows.length < 3 || composerLayerRows.some(row => !row.fontFamily.startsWith('"Craft Pixel"') || row.fontSize !== '16px' || row.lineHeight !== '16px')) throw new Error(`Composer layer typography contract failed: ${composerLayers.result.value}`)
  await call('Runtime.evaluate', { expression: `document.querySelector('[data-composer-card] textarea')?.focus()` })
  await call('Input.insertText', { text: 'aaa' })
  await delay(150)
  await capture(call, join(output, 'canary-composer-typography.png'))
  await call('Runtime.evaluate', { expression: `(() => { const input = document.querySelector('[data-composer-card] textarea'); input?.setSelectionRange(0, input.value.length); })()` })
  await capture(call, join(output, 'canary-composer-selected.png'))
  await call('Runtime.evaluate', { expression: `(() => { const input = document.querySelector('[data-composer-card] textarea'); if (!input) return; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()` })
  await capture(call, join(output, 'canary-main.png'))
  if (process.env.CRAFT_GOAL_FIXTURE === '1') {
    await call('Runtime.evaluate', { expression: `(() => { const card = document.querySelector('[data-composer-card]'); const root = card?.parentElement; let overlay = document.querySelector('.craft-overlay'); if (!card || !root) return; if (!overlay) { overlay = document.createElement('div'); overlay.className = 'craft-overlay craft-fixture-overlay'; document.body.append(overlay); } root.dataset.craftFixtureStyle = root.getAttribute('style') ?? ''; overlay.dataset.craftFixtureClass = overlay.className; const dock = document.createElement('div'); dock.className = 'nLMEza_dock craft-goal-fixture'; dock.dataset.goalBar = 'true'; dock.innerHTML = '<div class="nLMEza_bar"><span class="nLMEza_goalGlyph">◎</span><span class="nLMEza_label">进行中的目标</span><span class="nLMEza_objective">从零构建一个 Minecraft 风格的 DeepSeek Harness</span><div class="nLMEza_actions"><button class="nLMEza_iconBtn">Ⅱ</button><button class="nLMEza_iconBtn">✎</button><button class="nLMEza_iconBtn">×</button></div></div>'; root.insertBefore(dock, card); root.style.setProperty('position', 'fixed', 'important'); root.style.setProperty('left', '50%', 'important'); root.style.setProperty('bottom', '34px', 'important'); root.style.setProperty('width', 'min(812px,80vw)', 'important'); root.style.setProperty('transform', 'translateX(-50%)', 'important'); overlay.classList.add('craft-overlay-no-hotbar', 'craft-overlay-with-goal'); const xp = document.createElement('div'); xp.className = 'craft-xp craft-xp-ok craft-fixture-xp'; xp.innerHTML = '<b>10</b><span><i style="width:51%"></i></span><small>CONTEXT 51%</small>'; overlay.append(xp); window.dispatchEvent(new Event('resize')); })()` })
    await call('Runtime.evaluate', { expression: `(() => { const card = document.querySelector('[data-composer-card]'); const overlay = document.querySelector('.craft-overlay'); if (!card || !overlay || !overlay.classList.contains('craft-fixture-overlay')) return; const rect = card.getBoundingClientRect(); const zoom = Math.max(.5, Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--craft-ui-zoom')) || 1); overlay.style.setProperty('--craft-hud-bottom', Math.max(12, Math.round((window.innerHeight - rect.top + 12) / zoom)) + 'px'); overlay.style.setProperty('--craft-composer-left', Math.max(12, Math.round((rect.left + 12) / zoom)) + 'px'); overlay.style.setProperty('--craft-composer-right', Math.max(12, Math.round((window.innerWidth - rect.right + 12) / zoom)) + 'px'); })()` })
    await delay(250)
    const goalLayout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const dock = document.querySelector('[data-goal-bar]'); const panel = dock?.firstElementChild; const xp = document.querySelector('.craft-xp'); const composer = document.querySelector('[data-composer-card]'); const rect = element => { const value = element?.getBoundingClientRect(); return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null }; return { dock: rect(dock), panel: rect(panel), children: [...(panel?.children ?? [])].map(element => ({ tag: element.tagName, text: element.textContent, rect: rect(element) })), xp: rect(xp), composer: rect(composer), overlayStyle: document.querySelector('.craft-overlay')?.getAttribute('style'), panelStyle: panel ? { boxSizing: getComputedStyle(panel).boxSizing, display: getComputedStyle(panel).display, alignItems: getComputedStyle(panel).alignItems, padding: getComputedStyle(panel).padding, height: getComputedStyle(panel).height } : null }; })()` })
    console.log(`goal fixture layout: ${JSON.stringify(goalLayout.result.value)}`)
    const layout = goalLayout.result.value
    const contentBottom = Math.max(...layout.children.map(child => child.rect?.bottom ?? 0))
    if (!layout.panel || !layout.xp || !layout.composer || layout.xp.top < contentBottom + 4 || layout.xp.left < layout.panel.left + 3 || layout.xp.right > layout.panel.right - 3 || layout.xp.bottom > layout.panel.bottom - 3 || layout.panel.bottom > layout.composer.top + 1) throw new Error(`Goal HUD overlap contract failed: ${JSON.stringify(layout)}`)
    await capture(call, join(output, 'canary-goal-fixture.png'))
    await call('Runtime.evaluate', { expression: `(() => { const card = document.querySelector('[data-composer-card]'); if (!card) return; const meter = document.createElement('span'); meter.className = 'JObwrW_root craft-context-fixture'; meter.style.cssText = 'position:absolute;right:44px;bottom:8px'; meter.innerHTML = '<button class="JObwrW_trigger" aria-label="上下文已用 51%" aria-haspopup="dialog" aria-expanded="true">◔</button><div class="JObwrW_panel" role="dialog" aria-label="上下文已用"><div class="JObwrW_header"><span>上下文已用</span><b>51% · ~507K / 1M</b></div><div class="JObwrW_bar"><i class="JObwrW_segment JObwrW_colorMessages" style="width:51%"></i></div><dl class="JObwrW_rows"><div class="JObwrW_row"><dt>系统提示词</dt><dd>~1.7K</dd></div><div class="JObwrW_row"><dt>工具</dt><dd>~6.5K</dd></div><div class="JObwrW_row"><dt>对话消息</dt><dd>~373K</dd></div></dl></div>'; card.append(meter); })()` })
    await delay(150)
    const contextLayout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const xp = document.querySelector('.craft-xp'); const panel = document.querySelector('.craft-context-fixture [role="dialog"]'); const goal = document.querySelector('[data-goal-bar]>div'); const xpStyle = xp ? getComputedStyle(xp) : null; const panelStyle = panel ? getComputedStyle(panel) : null; const rect = element => { const value = element?.getBoundingClientRect(); return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom } : null }; return { xpOpacity: xpStyle?.opacity, xpVisibility: xpStyle?.visibility, panelZIndex: panelStyle?.zIndex, panel: rect(panel), goal: rect(goal) }; })()` })
    const context = contextLayout.result.value
    const overlapsGoal = context.panel && context.goal && context.panel.left < context.goal.right && context.panel.right > context.goal.left && context.panel.top < context.goal.bottom && context.panel.bottom > context.goal.top
    if (context.xpOpacity !== '0' || context.xpVisibility !== 'hidden' || Number(context.panelZIndex) < 1100 || overlapsGoal) throw new Error(`Context breakdown priority contract failed: ${JSON.stringify(context)}`)
    await capture(call, join(output, 'canary-context-open-fixture.png'))
    await call('Emulation.setDeviceMetricsOverride', { width: 980, height: 900, deviceScaleFactor: 1, mobile: false })
    await delay(180)
    const narrowContextLayout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const panel = document.querySelector('.craft-context-fixture [role="dialog"]')?.getBoundingClientRect(); const goal = document.querySelector('[data-goal-bar]>div')?.getBoundingClientRect(); return { panel: panel ? { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom } : null, goal: goal ? { left: goal.left, top: goal.top, right: goal.right, bottom: goal.bottom } : null }; })()` })
    const narrow = narrowContextLayout.result.value
    const narrowOverlap = narrow.panel && narrow.goal && narrow.panel.left < narrow.goal.right && narrow.panel.right > narrow.goal.left && narrow.panel.top < narrow.goal.bottom && narrow.panel.bottom > narrow.goal.top
    if (narrowOverlap) throw new Error(`Narrow context breakdown overlaps goal HUD: ${JSON.stringify(narrow)}`)
    await capture(call, join(output, 'canary-context-open-narrow-fixture.png'))
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await delay(120)
    await call('Runtime.evaluate', { expression: `document.querySelector('.craft-context-fixture')?.remove()` })
    const composerPopupFixtures = [
      ['command-listbox', '<button aria-haspopup="listbox" aria-expanded="true">+</button><div role="listbox" aria-label="命令"><div>compact</div><div>goal</div><div>model</div></div>'],
      ['permission-menu', '<button aria-label="权限模式">Workspace Write</button><div role="menu" aria-label="权限模式"><div>Read Only</div><div>Workspace Write</div><div>Full access</div></div>'],
      ['model-menu', '<button aria-haspopup="menu" aria-expanded="true">DeepSeek-V4</button><div role="menu" aria-label="模型选择"><div>模型</div><div>推理等级</div></div>'],
    ]
    for (const [name, markup] of composerPopupFixtures) {
      await call('Runtime.evaluate', { expression: `(() => { const card = document.querySelector('[data-composer-card]'); if (!card) return; const fixture = document.createElement('span'); fixture.className = 'craft-composer-popup-fixture'; fixture.style.cssText = 'position:absolute;right:110px;bottom:8px;z-index:1200'; fixture.innerHTML = ${JSON.stringify(markup)}; card.append(fixture); })()` })
      await delay(120)
      const popupPriority = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const xp = document.querySelector('.craft-xp'); const fixture = document.querySelector('.craft-composer-popup-fixture'); const style = xp ? getComputedStyle(xp) : null; return { xpOpacity: style?.opacity, xpVisibility: style?.visibility, popupRole: fixture?.querySelector('[role]')?.getAttribute('role') }; })()` })
      if (popupPriority.result.value.xpOpacity !== '0' || popupPriority.result.value.xpVisibility !== 'hidden') throw new Error(`${name} does not take priority over bottom HUD: ${JSON.stringify(popupPriority.result.value)}`)
      await capture(call, join(output, `canary-${name}-open-fixture.png`))
      await call('Runtime.evaluate', { expression: `document.querySelector('.craft-composer-popup-fixture')?.remove()` })
    }
    await call('Runtime.evaluate', { expression: `(() => { document.querySelector('.craft-fixture-xp')?.remove(); const dock = document.querySelector('.craft-goal-fixture'); const root = dock?.parentElement; dock?.remove(); if (root) { const previous = root.dataset.craftFixtureStyle ?? ''; if (previous) root.setAttribute('style', previous); else root.removeAttribute('style'); delete root.dataset.craftFixtureStyle; } const overlay = document.querySelector('.craft-overlay'); if (overlay?.classList.contains('craft-fixture-overlay')) overlay.remove(); else if (overlay) { overlay.className = overlay.dataset.craftFixtureClass ?? overlay.className; delete overlay.dataset.craftFixtureClass; } window.dispatchEvent(new Event('resize')); })()` })
    await delay(180)
  }
  if (workspaceAvailable && await evaluateBoolean(call, `[...document.querySelectorAll('*')].some(element => element.textContent?.includes(${JSON.stringify(targetSession)}))`)) {
    await clickText(call, targetSession, true)
    await delay(2200)
    const sessionHud = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const hotbar = document.querySelector('.craft-hotbar')?.getBoundingClientRect(); const xp = document.querySelector('.craft-xp')?.getBoundingClientRect(); const composer = document.querySelector('[data-composer-card]')?.getBoundingClientRect(); return { hotbar: hotbar ? { left: hotbar.left, top: hotbar.top, right: hotbar.right, bottom: hotbar.bottom } : null, xp: xp ? { left: xp.left, top: xp.top, right: xp.right, bottom: xp.bottom } : null, composer: composer ? { left: composer.left, top: composer.top, right: composer.right, bottom: composer.bottom } : null } })()` })
    if (sessionHud.result.value.hotbar) throw new Error(`Passive historical session must not show hotbar: ${JSON.stringify(sessionHud.result.value)}`)
    if (sessionHud.result.value.xp && sessionHud.result.value.composer && sessionHud.result.value.xp.bottom > sessionHud.result.value.composer.top - 4) throw new Error(`XP HUD overlaps composer: ${JSON.stringify(sessionHud.result.value)}`)
    if (sessionHud.result.value.xp && sessionHud.result.value.composer && sessionHud.result.value.xp.left < sessionHud.result.value.composer.left + 200) throw new Error(`Passive XP HUD does not clear message actions: ${JSON.stringify(sessionHud.result.value)}`)
    await capture(call, join(output, 'canary-session.png'))
  } else {
    console.log('session HUD capture skipped: target canary session is not visible')
  }
  await call('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('button[title="DSH Craft UI"]'); button?.focus(); button?.click(); })()` })
  await delay(600)
  await call('Runtime.evaluate', { expression: `document.querySelector('.craft-control-panel .craft-option-button,.craft-control-panel .craft-menu-link')?.focus()` })
  const optionsContract = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const panel = document.querySelector('.craft-control-panel'); return { buttons: panel?.querySelectorAll('.craft-option-button,.craft-menu-link').length ?? 0, nav: Boolean(panel?.querySelector('nav')), selects: panel?.querySelectorAll('select').length ?? 0, checkboxes: panel?.querySelectorAll('input[type="checkbox"]').length ?? 0, focused: document.activeElement?.tagName }; })()` })
  if (optionsContract.result.value.buttons < 6 || optionsContract.result.value.nav || optionsContract.result.value.selects || optionsContract.result.value.checkboxes || optionsContract.result.value.focused !== 'BUTTON') throw new Error(`Java Options contract failed: ${JSON.stringify(optionsContract.result.value)}`)
  await capture(call, join(output, 'canary-settings.png'))
  await setOption(call, '界面尺寸:', '紧凑')
  await delay(250)
  const compactWidth = await elementWidth(call, '.craft-control-panel')
  await capture(call, join(output, 'canary-compact.png'))
  await setOption(call, '界面尺寸:', '大号')
  await delay(250)
  const largeWidth = await elementWidth(call, '.craft-control-panel')
  await capture(call, join(output, 'canary-large.png'))
  if (!(largeWidth > compactWidth)) throw new Error(`UI size setting did not scale panel: compact=${compactWidth}, large=${largeWidth}`)
  await setOption(call, '界面尺寸:', '标准')
  await delay(200)
  await clickText(call, 'HUD 与玩法设置…')
  await delay(400)
  await capture(call, join(output, 'canary-gameplay.png'))
  await clickText(call, '返回')
  await delay(150)
  await clickText(call, '素材与资源包…')
  await delay(400)
  await capture(call, join(output, 'canary-assets.png'))
  await clickText(call, '返回')
  await delay(250)
  await setOption(call, '世界主题:', '主世界日间')
  await delay(500)
  await capture(call, join(output, 'canary-day.png'))
  await call('Emulation.setDeviceMetricsOverride', { width: 760, height: 900, deviceScaleFactor: 1, mobile: false })
  await delay(350)
  await capture(call, join(output, 'canary-mobile-settings.png'))
  await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('.craft-option-button')].find(button => button.textContent?.includes('Craft UI:')))?.click()` })
  await waitForExpression(call, `!document.body.classList.contains('craft-ui-enabled')`)
  await delay(250)
  const disabledDiagnostic = await call('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ enabled: document.body.classList.contains('craft-ui-enabled'), dark: document.body.hasAttribute('data-ds-dark-theme'), colorScheme: document.documentElement.style.colorScheme, bgToken: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(), bodyBackground: getComputedStyle(document.body).backgroundColor })` })
  console.log(`disabled restoration: ${disabledDiagnostic.result.value}`)
  await call('Runtime.evaluate', { expression: `([...document.querySelectorAll('.craft-option-button')].find(button => button.textContent?.includes('Craft UI:')))?.click()` })
  await waitForExpression(call, `document.body.classList.contains('craft-ui-enabled')`)
  await setOption(call, '世界主题:', '深板岩夜间')
  await waitForExpression(call, `document.body.dataset.craftTheme === 'craft-deepslate' && document.body.hasAttribute('data-ds-dark-theme')`)
  if (pluginErrors.length > 0) throw new Error(`Craft UI browser errors:\n${pluginErrors.join('\n')}`)
  socket.close()
  console.log('captured main, Java-style options, gameplay, resource-pack, day, and narrow canary screenshots')
} finally {
  await terminateBrowser(browser, browserProfile)
}

async function capture(call, path) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}
async function clickText(call, text, includes = false) {
  let value = null
  for (let attempt = 0; attempt < 50 && !value; attempt += 1) {
    const point = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const matches = [...document.querySelectorAll('*')].filter(element => ${includes ? `element.textContent?.includes(${JSON.stringify(text)})` : `element.textContent?.trim() === ${JSON.stringify(text)}`}).map(element => ({ element, rect: element.getBoundingClientRect() })).filter(entry => entry.rect.width > 0 && entry.rect.height > 0).sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height); const match = matches[0]; return match ? { x: match.rect.left + match.rect.width / 2, y: match.rect.top + match.rect.height / 2 } : null; })()` })
    value = point.result.value
    if (!value) await delay(100)
  }
  if (!value) throw new Error(`Could not find text to click: ${text}`)
  const { x, y } = value
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
async function terminateBrowser(browser, profile) {
  if (process.platform === 'win32') {
    await new Promise(resolveKill => {
      const killer = spawn('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like "*$env:CRAFT_EDGE_PROFILE*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore', env: { ...process.env, CRAFT_EDGE_PROFILE: profile } })
      killer.once('exit', resolveKill)
      killer.once('error', resolveKill)
    })
  }
  browser.kill()
}
async function waitForBrowser() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) return } catch {}
    await delay(100)
  }
  throw new Error('Edge DevTools did not start')
}
async function waitForExpression(call, expression, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true })
    if (result.result.value === true) return
    await delay(200)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}
async function evaluateBoolean(call, expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true })
  return result.result.value === true
}
async function setOption(call, label, value) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { const button = [...document.querySelectorAll('.craft-option-button')].find(row => row.textContent?.includes(${JSON.stringify(label)})); if (!button) return 'missing'; if (button.textContent?.includes(${JSON.stringify(value)})) return 'done'; button.click(); return 'clicked'; })()` })
    if (result.result.value === 'done') return
    if (result.result.value === 'missing') throw new Error(`Could not find option: ${label}`)
    await delay(120)
  }
  throw new Error(`Could not set option ${label} to ${value}`)
}
async function elementWidth(call, selector) {
  const result = await call('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width ?? 0`, returnByValue: true })
  return result.result.value
}
function delay(ms) { return new Promise(resolveDelay => setTimeout(resolveDelay, ms)) }

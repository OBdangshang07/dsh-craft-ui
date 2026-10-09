import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { withCanaryBrowser, delay } from './canary-browser.mjs'

const log = process.argv[2]
if (!log || resolve(log) !== resolve(import.meta.dirname, '../.generated/dsh-021-compat/workbench-canary/stdout.log')) throw new Error('Use only the explicitly isolated alpha compatibility startup log')
const baseline = process.argv.includes('--baseline')
const fixture = baseline ? undefined : await build({ entryPoints: [resolve(import.meta.dirname, 'layout-fixture.tsx')], bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic', define:{ 'process.env.NODE_ENV':'"production"' } })
await withCanaryBrowser(log, async b => {
  const { evaluate, waitFor, clickText, capture, call, errors } = b
  await evaluate(`document.querySelector('[data-row-key="session:c8cd6e4e-38ab-49f9-b12e-a562d8f02721"]').click()`)
  await waitFor(`!!document.querySelector('[data-goal-bar]')`)
  await clickText('编辑目标')
  await waitFor(`!!document.querySelector('[data-goal-bar] textarea')`)
  await delay(200)
  const geometry = await evaluate(`(() => {
    const editor = document.querySelector('[data-goal-bar] textarea'), panel = editor.parentElement;
    const e = editor.getBoundingClientRect(), p = panel.getBoundingClientRect();
    return { panelHeight:p.height, editorHeight:e.height, editorFits:e.top>=p.top+3 && e.bottom<=p.bottom-30,
      font:getComputedStyle(editor).fontFamily, textToken:getComputedStyle(document.body).getPropertyValue('--dsw-font-family') };
  })()`)
  await capture(baseline ? 'alpha-baseline-goal' : 'alpha-goal-multiline')
  if (baseline) { console.log('Alpha baseline:', JSON.stringify(geometry)); return }
  assert.ok(geometry.editorFits, 'Multiline editor must stay above the reserved XP footer')
  assert.ok(geometry.panelHeight > 82, 'Goal panel must grow with the multiline editor')
  assert.match(geometry.font, /Craft Pixel/)
  assert.match(geometry.textToken, /Craft Pixel/)
  const original = await evaluate(`document.querySelector('[data-goal-bar] textarea').value`)
  const key = async (name, code, modifiers = 0) => {
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:name, code:name, windowsVirtualKeyCode:code, modifiers, ...(name==='Enter' ? {text:'\r'} : {}) })
    await call('Input.dispatchKeyEvent', { type:'keyUp', key:name, code:name, windowsVirtualKeyCode:code, modifiers })
  }
  // Native handlers: newline does not save; Escape discards; Enter saves a paused goal.
  await evaluate(`{ const e=document.querySelector('[data-goal-bar] textarea'); e.focus(); e.setSelectionRange(e.value.length,e.value.length); }`)
  await key('Enter', 13, 8)
  await waitFor(`document.querySelector('[data-goal-bar] textarea')?.value.endsWith('\\n')`)
  await key('Escape', 27)
  await waitFor(`!document.querySelector('[data-goal-bar] textarea')`)
  await clickText('编辑目标')
  assert.equal(await evaluate(`document.querySelector('[data-goal-bar] textarea').value`), original)
  await evaluate(`{ const e=document.querySelector('[data-goal-bar] textarea');e.focus();e.select(); }`)
  await call('Input.insertText', { text:'Minecraft 目标兼容自检\nEnter 保存且不启动模型' })
  await key('Enter', 13)
  await waitFor(`!document.querySelector('[data-goal-bar] textarea') && document.querySelector('[data-goal-bar]').textContent.includes('Minecraft 目标兼容自检')`)
  await clickText('编辑目标')
  await evaluate(`{ const e=document.querySelector('[data-goal-bar] textarea');e.focus();e.select(); }`)
  await call('Input.insertText', { text:original })
  await key('Enter', 13)
  await waitFor(`!document.querySelector('[data-goal-bar] textarea')`)
  await clickText('编辑目标')
  await evaluate(fixture.outputFiles[0].text)
  await waitFor(`!!document.querySelector('#craft-layout-fixture .craft-xp')`)
  const measure = () => evaluate(`(() => {
    const panel=document.querySelector('[data-goal-bar]>div'), editor=panel.querySelector('textarea'), actions=panel.lastElementChild;
    const p=panel.getBoundingClientRect(), e=editor.getBoundingClientRect(), a=actions.getBoundingClientRect();
    const xp=document.querySelector('#craft-layout-fixture .craft-xp'), x=xp.getBoundingClientRect();
    const hotbar=document.querySelector('#craft-layout-fixture .craft-hotbar'), h=hotbar?.getBoundingClientRect();
    const seat=document.querySelector('[data-composer-seat]').getBoundingClientRect();
    return {editorFits:e.top>=p.top+3 && e.bottom<=p.bottom-30,actionsFit:a.left>=p.left && a.right<=p.right && a.bottom<=p.bottom-30,
      panelFits:p.left>=0 && p.right<=innerWidth+1,overflow:editor.scrollHeight>editor.clientHeight,
      xpInFooter:x.left>=p.left && x.right<=p.right && x.top>=p.bottom-27 && x.bottom<=p.bottom-3,
      hotbarClears:!h || h.bottom<=seat.top-8,barHeight:p.height};
  })()`)
  for (const theme of ['craft-deepslate','craft-day']) {
    await evaluate(`document.body.dataset.craftTheme=${JSON.stringify(theme)}`)
    for (const width of [1440,640,390]) {
      await call('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
      for (const scale of [1,2,3]) {
        await evaluate(`document.body.dataset.craftScale=${JSON.stringify(String(scale))}`)
        await delay(150)
        const layout = await measure()
        assert.ok(layout.editorFits && layout.actionsFit && layout.panelFits, `Goal overflow: ${theme}/${width}/${scale}: ${JSON.stringify(layout)}`)
        assert.ok(layout.xpInFooter, `XP must use measured goal footer: ${theme}/${width}/${scale}: ${JSON.stringify(layout)}`)
      }
      await capture(`alpha-layout-${theme}-${width}`)
    }
  }
  // A short window makes the composer seat cross the old 55%-height cutoff.
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:500,deviceScaleFactor:1,mobile:false})
  await evaluate(`window.craftLayoutFixture.busy(true)`)
  await waitFor(`!!document.querySelector('#craft-layout-fixture .craft-hotbar')`)
  await delay(200)
  assert.ok((await measure()).hotbarClears, 'Active hotbar must clear the tall native composer seat')
  await capture('alpha-layout-busy')
  await evaluate(`window.craftLayoutFixture.busy(false)`)
  await waitFor(`!document.querySelector('#craft-layout-fixture .craft-hotbar')`)
  // Runtime font overrides simulate native settings without touching durable preferences.
  const fonts = await evaluate(`(() => {
    const before=document.body.style.cssText;
    document.body.style.setProperty('--dsh-font-family-text','Arial');document.body.style.setProperty('--dsh-font-family-code','Consolas');document.body.style.setProperty('--dsh-font-family-terminal','Courier New');
    const text=document.createElement('span'), code=document.createElement('code');text.style.fontFamily='var(--dsw-font-family)';code.style.fontFamily='var(--ds-font-family-code)';document.body.append(text,code);
    const enabled=getComputedStyle(text).fontFamily, codeEnabled=getComputedStyle(code).fontFamily;
    document.body.classList.remove('craft-ui-enabled');
    const disabled=getComputedStyle(text).fontFamily, codeDisabled=getComputedStyle(code).fontFamily, terminal=getComputedStyle(document.body).getPropertyValue('--dsh-font-family-terminal');
    document.body.classList.add('craft-ui-enabled');document.body.style.cssText=before;text.remove();code.remove();
    return {enabled,disabled,codeEnabled,codeDisabled,terminal};
  })()`)
  assert.match(fonts.enabled,/Craft Pixel/);assert.match(fonts.disabled,/Arial/);assert.doesNotMatch(fonts.disabled,/Craft Pixel/)
  assert.match(fonts.codeEnabled,/Consolas/);assert.equal(fonts.codeEnabled,fonts.codeDisabled);assert.equal(fonts.terminal,'Courier New')
  await evaluate(`window.craftLayoutFixture.dispose()`)
  assert.deepEqual(errors, [])
  console.log('Alpha layout passed: real goal multiline/Shift+Enter/Escape/save; synthetic XP/hotbar over real composer; both themes, 1440/640/390 widths and all scales; text font override/restoration, unchanged code/terminal; no model requests.')
})

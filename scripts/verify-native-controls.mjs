import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { delay, withCanaryBrowser } from './canary-browser.mjs'

const logPath = process.argv[2]
if (!logPath) throw new Error('Pass an isolated Harness startup log; never use a working profile for control-write tests')
const root = resolve(import.meta.dirname, '..')
const localCss = process.argv.includes('--local-css')
let css
if (localCss) {
  const bundle = await readFile(resolve(root, 'lib/client.js'), 'utf8')
  const literal = bundle.match(/var generated_styles_default = (`[\s\S]*?`);/)?.[1]
  if (!literal) throw new Error('Run the plugin build before testing local CSS')
  css = runInNewContext(literal, Object.create(null), { timeout: 1000 })
}

await withCanaryBrowser(logPath, async browser => {
  const { evaluate, call, waitFor, clickText, capture } = browser
  if (css) await evaluate(`document.querySelector('style[data-plugin="dsh-craft-ui"]').textContent = ${JSON.stringify(css)}`)
  await clickText('设置')
  await waitFor(`!!document.querySelector('[role="dialog"] button[role="switch"]')`)
  const switchSelector = '[role="dialog"] button[role="switch"]'
  const snapshot = () => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(switchSelector)});
    const thumb = el.querySelector('span'); const r = el.getBoundingClientRect(); const t = thumb.getBoundingClientRect();
    return { state: el.getAttribute('aria-checked'), radius:getComputedStyle(thumb).borderRadius,
      width:r.width, height:r.height, offset:t.left-r.left, label:el.getAttribute('aria-label'),
      fits:t.left>=r.left+2 && t.right<=r.right-2 && t.top>=r.top+2 && t.bottom<=r.bottom-2 };
  })()`)
  const initial = await snapshot()
  assert.equal(initial.radius, '0px', 'Native switch thumb must be square, not the stock circle')
  assert.equal(initial.width, 48)
  assert.equal(initial.height, 26)
  assert.ok(initial.fits, 'Switch thumb must stay inside the track')
  assert.ok(initial.label, 'Keep the upstream accessible label')
  await evaluate(`document.querySelector(${JSON.stringify(switchSelector)}).focus()`)
  await key(call, ' ', 'Space', 32)
  await waitFor(`document.querySelector(${JSON.stringify(switchSelector)}).getAttribute('aria-checked') !== ${JSON.stringify(initial.state)}`)
  await delay(200)
  const toggled = await snapshot()
  assert.ok(toggled.fits)
  assert.equal(Math.abs(toggled.offset - initial.offset), 22)
  // Harness temporarily disables controls during preference writes, releasing focus.
  await waitFor(`!document.querySelector(${JSON.stringify(switchSelector)}).disabled`)
  await evaluate(`document.querySelector(${JSON.stringify(switchSelector)}).focus()`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(switchSelector)})).outlineStyle`), 'solid')
  // Restore the isolated preference through the real native React event handler.
  await key(call, ' ', 'Space', 32)
  await waitFor(`document.querySelector(${JSON.stringify(switchSelector)}).getAttribute('aria-checked') === ${JSON.stringify(initial.state)}`)
  await waitFor(`!document.querySelector(${JSON.stringify(switchSelector)}).disabled`)
  await evaluate(`window.__craftSwitchMarkup = document.querySelector(${JSON.stringify(switchSelector)}).outerHTML`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="settings.general.item"] [class$="_stepper"]')).borderRadius`), '0px')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="dialog"] button[aria-current="true"]')).color`), 'rgb(255, 255, 160)')
  await capture('native-general-fixed')

  await clickText('内置插件')
  await waitFor(`!!document.querySelector('[role="dialog"] input[type="search"]')`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="dialog"] input[type="search"]')).borderTopWidth`), '2px')
  await capture('native-plugins-fixed')
  await clickText('Agent 预设')
  await waitFor(`!!document.querySelector('[role="dialog"] button[aria-pressed="true"]')`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="dialog"] button[aria-pressed="true"]')).color`), 'rgb(255, 255, 160)')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="dialog"] button[aria-pressed="true"]')).filter`), 'none')
  await capture('native-presets-fixed')
  await clickText('模式说明: 标准模式')
  const tabs = '[role="tablist"]:not([data-dockkit-strip])'
  await waitFor(`!!document.querySelector('${tabs} [role="tab"]')`)
  const initialTab = await evaluate(`document.querySelector('${tabs} [aria-selected="true"]').id`)
  await evaluate(`document.querySelector('${tabs} [aria-selected="true"]').focus()`)
  await key(call, 'ArrowRight', 'ArrowRight', 39)
  await waitFor(`document.querySelector('${tabs} [aria-selected="true"]').id !== ${JSON.stringify(initialTab)}`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${tabs}>span[aria-hidden="true"]')).display`), 'none')
  await capture('native-segmented-tabs-fixed')
  await key(call, 'Escape', 'Escape', 27)
  await clickText('模型')
  await waitFor(`document.querySelector('[role="dialog"]').innerText.includes('添加')`)
  await capture('native-models-fixed')
  await clickText('关闭')
  // Read-only menu inspection: no permission/model selection is submitted.
  await evaluate(`document.querySelector('button[aria-label^="访问模式"]')?.click()`)
  await waitFor(`!!document.querySelector('[role="menu"]')`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="menu"]')).borderRadius`), '0px')
  await capture('native-permissions-fixed')
  await key(call, 'Escape', 'Escape', 27)
    await evaluate(`document.querySelector('button[aria-label^="选择模型"]')?.click()`)
    await waitFor(`!!document.querySelector('.craft-reasoning-popup,[role="menu"]')`)
  await capture('native-model-menu-fixed')
  await key(call, 'Escape', 'Escape', 27)

  // State matrix supplements live screens with disabled/mixed/empty variants.
  // Switches are clones of the real Harness component. Other fixtures use the
  // native input and ARIA structures of Checkbox / SegmentedControl / Menu.
  await evaluate(`(() => {
    const panel = document.createElement('section'); panel.id='craft-control-regression'; panel.role='dialog';
    panel.style.cssText='position:fixed;inset:18px;z-index:2147483646;overflow:auto;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--craft-font)';
    panel.innerHTML='<h2 style="font-weight:400">原生控件 · 状态自检</h2><p>开关 / 复选 / 单选 / 分段 / 下拉 / 菜单</p><div class="matrix" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px"></div>';
    const matrix=panel.querySelector('.matrix');
    for(const [name,state,disabled] of [['关闭',false,false],['开启',true,false],['禁用关闭',false,true],['禁用开启',true,true]]){
      const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #62695c';row.innerHTML='<span>'+name+'</span>'+window.__craftSwitchMarkup;
      const el=row.querySelector('button');el.setAttribute('aria-checked',String(state));el.setAttribute('aria-label',name);el.disabled=disabled;
      el.addEventListener('click',()=>el.setAttribute('aria-checked',String(el.getAttribute('aria-checked')!=='true')));matrix.append(row);
    }
    const fields=document.createElement('div');fields.style.cssText='display:grid;gap:16px;margin:24px 0';
    fields.innerHTML='<label><input id="check" type="checkbox"> 像素复选框</label><label><input type="checkbox" checked> 已选择</label><label><input id="mixed" type="checkbox"> 部分选择</label><label><input type="checkbox" checked disabled> 禁用选项</label><label><input type="radio" name="test-radio" checked> 单选一</label><label><input type="radio" name="test-radio"> 单选二</label><label>选项 <select aria-label="下拉选项"><option>默认模式</option><option>其他模式</option></select></label><div role="tablist" aria-label="分段选项" style="display:inline-grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:480px"><span aria-hidden="true"></span><button role="tab" aria-selected="true">选中</button><button role="tab" aria-selected="false">未选</button><button role="tab" aria-selected="false" disabled>禁用</button></div><div role="menu" aria-label="菜单状态" style="max-width:320px;padding:8px"><button role="menuitemradio" aria-checked="true" style="display:block;width:100%">当前选项</button><button role="menuitemradio" aria-checked="false" style="display:block;width:100%">其他选项</button></div><input aria-label="无效输入" aria-invalid="true" value="无效值"><input aria-label="禁用输入" disabled value="只读状态">';
    fields.querySelector('#mixed').indeterminate=true;panel.append(fields);document.body.append(panel);
  })()`)
  const inspectMatrix = () => evaluate(`(() => {
    const panel=document.querySelector('#craft-control-regression');
    const switches=[...panel.querySelectorAll('[role=switch]')].map(el=>{ const r=el.getBoundingClientRect(),t=el.firstElementChild.getBoundingClientRect();return {round:getComputedStyle(el.firstElementChild).borderRadius, fits:t.left>=r.left+2&&t.right<=r.right-2&&t.top>=r.top+2&&t.bottom<=r.bottom-2}; });
    const check=panel.querySelector('#check'),mixed=panel.querySelector('#mixed');
    const tabs=[...panel.querySelectorAll('[role=tab]')].map(el=>getComputedStyle(el).backgroundColor);
    return {switches,checkAppearance:getComputedStyle(check).appearance,checkRadius:getComputedStyle(check).borderRadius,mixed:getComputedStyle(mixed).backgroundImage,tabs,selectAppearance:getComputedStyle(panel.querySelector('select')).appearance,overflow:panel.scrollWidth>panel.clientWidth,disabledOpacity:getComputedStyle(panel.querySelector('button:disabled')).opacity,invalid:getComputedStyle(panel.querySelector('[aria-invalid]')).borderTopColor};
  })()`)
  for (const theme of ['craft-deepslate','craft-day']) {
    await evaluate(`document.body.dataset.craftTheme=${JSON.stringify(theme)}`)
    for (const width of [1440,640,390]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
      await delay(180)
      const state=await inspectMatrix()
      assert.ok(state.switches.every(s=>s.round==='0px'&&s.fits))
      assert.equal(state.checkAppearance,'none');assert.equal(state.checkRadius,'0px')
      assert.notEqual(state.mixed,'none');assert.notEqual(state.tabs[0],state.tabs[1])
      assert.equal(state.selectAppearance,'none');assert.equal(state.overflow,false)
      assert.ok(Number(state.disabledOpacity)<1)
      assert.equal(state.invalid,'rgb(220, 128, 107)')
      await capture('matrix-'+theme+'-'+width)
    }
  }
  await evaluate(`document.querySelector('#check').focus()`)
  await key(call,' ','Space',32)
  assert.equal(await evaluate(`document.querySelector('#check').checked`),true)
  const disabledBefore=await evaluate(`document.querySelector('#craft-control-regression button:disabled').getAttribute('aria-checked')`)
  await evaluate(`document.querySelector('#craft-control-regression button:disabled').click()`)
  assert.equal(await evaluate(`document.querySelector('#craft-control-regression button:disabled').getAttribute('aria-checked')`),disabledBefore)
  for (const mode of ['off','reduced']) {
    await evaluate(`document.body.dataset.craftMotion=${JSON.stringify(mode)}`)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#craft-control-regression [role=switch]>span')).transitionDuration`),'0s')
  }
  await evaluate(`document.body.dataset.craftMotion='full'`)
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#craft-control-regression [role=switch]>span')).transitionDuration`),'0s')
  await call('Emulation.setEmulatedMedia',{features:[]})
  await evaluate(`document.body.classList.remove('craft-ui-enabled')`)
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('#craft-control-regression [role=switch]>span')).borderRadius`),'0px','Disabling Craft UI must restore native controls')
  assert.equal(browser.errors.length,0,JSON.stringify(browser.errors))
  console.log('Native controls verified: real General/Plugins/Presets/Models settings and menus; Space toggle; 2 themes x 3 widths; disabled/mixed/selected states; reduced motion; theme-off restoration. '+(localCss?'Local built CSS injected.':'Installed plugin CSS.'))
})

async function key(call,key,code,windowsVirtualKeyCode){
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode})
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode})
}

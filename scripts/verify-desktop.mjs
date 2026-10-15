import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { desktopArchiveText } from './desktop-archive.mjs'
import { withCanaryBrowser, delay } from './canary-browser.mjs'

const root=resolve(import.meta.dirname,'..'), log=process.argv[2]
if (!log || resolve(log)!==join(root,'.generated','desktop-workbench-canary','stdout.log')) throw new Error('Only the isolated desktop-workbench-canary is allowed')
const desktop=process.env.CRAFT_DESKTOP_ROOT ?? join(process.env.LOCALAPPDATA,'Programs','DeepSeek Harness')
const preload=await desktopArchiveText(join(desktop,'resources','app.asar'),'lib/preload-app.cjs')
const start=preload.indexOf('function installWindowsMenu() {'), end=preload.indexOf('//#endregion',start)
if (start<0 || end<start) throw new Error('Unsupported Desktop caption menu implementation')
const nativeMenu=preload.slice(start,end)

await withCanaryBrowser(log,async b=>{
  const {evaluate,waitFor,call,clickText,capture,errors}=b
  await evaluate(`(() => {
    const events=[];
    const electron={ipcRenderer:{invoke:async (...args)=>{events.push(args)}}};
    const DESKTOP_IPC={windowsMenu:'fixture:native-menu'};
    const resolveDesktopLocale=lang=>({messages:lang.startsWith('zh')?{menuBar:'桌面菜单',application:'应用',edit:'编辑'}:{menuBar:'Desktop menu',application:'Application',edit:'Edit'}});
    ${nativeMenu}
    const root=document.documentElement;
    root.dataset.platform='win32';root.dataset.windowsTitlebar='';root.style.setProperty('--dsh-windows-titlebar-height','40px');
    let menu=installWindowsMenu(),oldRoot;
    window.desktopChromeFixture={events,update:()=>menu.update(),replace:()=>{oldRoot=document.querySelector('[data-windows-menu]').shadowRoot;menu.dispose();menu=installWindowsMenu()},hide:()=>menu.dispose(),show:()=>{menu=installWindowsMenu()},oldStyleCount:()=>oldRoot.querySelectorAll('[data-craft-desktop-menu]').length,dispose:()=>{menu.dispose();delete root.dataset.windowsTitlebar;delete root.dataset.platform;delete root.dataset.fullscreen;root.style.removeProperty('--dsh-windows-titlebar-height')}};
  })()`)
  const nativeButton=`document.querySelector('[data-windows-menu]')?.shadowRoot?.querySelector('button')`
  await waitFor(`!!document.querySelector('[data-windows-menu]')?.shadowRoot?.querySelector('[data-craft-desktop-menu]')`)
  const menuStyle=()=>evaluate(`(()=>{const el=${nativeButton},s=getComputedStyle(el);return{radius:s.borderRadius,border:s.borderTopWidth,font:s.fontFamily}})()`)
  assert.deepEqual(await menuStyle(),{radius:'0px',border:'2px',font:'"Craft Pixel", ui-monospace, "Microsoft YaHei UI", monospace'})
  const key=async(name,code)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code});await call('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code})}
  const nativeInteraction=async selector=>{
    const before=await evaluate(`window.desktopChromeFixture.events.length`)
    const point=await evaluate(`(()=>{const r=(${nativeButton}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y})?.hasAttribute('data-windows-menu')`),true,'Native caption menu must not be covered')
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point})
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point})
    await waitFor(`window.desktopChromeFixture.events.length===${before+1}`)
    await evaluate(`(${nativeButton}).focus()`)
    await key('ArrowRight',39)
    assert.equal(await evaluate(`document.querySelector('[data-windows-menu]').shadowRoot.activeElement?.textContent`),'编辑')
    await key('Escape',27)
    assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),true,'Caption-menu Escape must not dismiss the page dialog')
  }
  const assertBounds=async(selector,inset=40)=>{
    const box=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight}})()`)
    assert.ok(box.left>=-1 && box.right<=box.w+1 && box.top>=inset-1 && box.bottom<=box.h+1,`Unsafe desktop bounds for ${selector}: ${JSON.stringify(box)}`)
  }
  await evaluate(`document.querySelector('button[title="DSH Craft UI"]').click()`)
  await waitFor(`!!document.querySelector('.craft-control-panel')`)
  await nativeInteraction('.craft-control-panel')
  for (const theme of ['craft-deepslate','craft-day']) {
    await evaluate(`document.body.dataset.craftTheme=${JSON.stringify(theme)}`)
    for (const [width,height] of [[1440,900],[900,500],[640,700],[390,700]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
      for (const scale of [1,2,3]) {
        await evaluate(`document.body.dataset.craftScale=${JSON.stringify(String(scale))}`)
        await delay(100)
        await assertBounds('.craft-control-panel')
        assert.equal(await evaluate(`document.querySelector('.craft-panel-shade').getBoundingClientRect().top`),40)
      }
      await capture(`desktop-options-${theme}-${width}`)
    }
  }
  const originalLanguage=await evaluate(`document.documentElement.lang`)
  await evaluate(`document.documentElement.lang='en';window.desktopChromeFixture.update()`)
  assert.ok(await evaluate(`document.querySelector('[data-windows-menu]').getBoundingClientRect().right<=innerWidth-138`),'English caption labels must not cover window buttons')
  await evaluate(`document.documentElement.lang=${JSON.stringify(originalLanguage)};window.desktopChromeFixture.update()`)
  await evaluate(`document.documentElement.dataset.fullscreen='true'`)
  await delay(120)
  assert.equal(await evaluate(`document.querySelector('.craft-panel-shade').getBoundingClientRect().top`),40,'Keep the visible fullscreen menubar available')
  await nativeInteraction('.craft-control-panel')
  await evaluate(`window.desktopChromeFixture.hide()`)
  await delay(120)
  assert.equal(await evaluate(`document.querySelector('.craft-panel-shade').getBoundingClientRect().top`),0)
  await assertBounds('.craft-control-panel',0)
  await evaluate(`window.desktopChromeFixture.show()`)
  await waitFor(`!!document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[data-craft-desktop-menu]')`)
  await evaluate(`delete document.documentElement.dataset.fullscreen;window.desktopChromeFixture.replace()`)
  await waitFor(`!!document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[data-craft-desktop-menu]') && window.desktopChromeFixture.oldStyleCount()===0`)
  // The actual preference removes and restores only our shadow style.
  await clickText('Craft UI: 开')
  await waitFor(`!document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[data-craft-desktop-menu]')`)
  assert.equal((await menuStyle()).radius,'6px')
  assert.equal(await evaluate(`document.querySelector('.craft-panel-shade').getBoundingClientRect().top`),40)
  await clickText('Craft UI: 关')
  await waitFor(`!!document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[data-craft-desktop-menu]')`)
  await clickText('完成')
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await delay(300)
  await waitFor(`!!document.querySelector('[data-row-key="session:c8cd6e4e-38ab-49f9-b12e-a562d8f02721"]')`)
  await evaluate(`document.querySelector('[data-row-key="session:c8cd6e4e-38ab-49f9-b12e-a562d8f02721"]').click()`)
  await waitFor(`document.querySelectorAll('.craft-map-preview img').length===3`)
  for (const width of [1440,640]) for (const scale of [1,2,3]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
    await evaluate(`document.body.dataset.craftScale=${JSON.stringify(String(scale))}`)
    await delay(100)
    assert.ok(await evaluate(`Math.abs(document.querySelector('.craft-overlay').getBoundingClientRect().top-40)<1`),'HUD uses physical-pixel caption clearance at every zoom')
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await clickText('打开图片工作台 / 对比')
  await waitFor(`!!document.querySelector('.craft-image-canvas img')`)
  await nativeInteraction('.craft-workbench')
  await evaluate(`document.querySelector('[data-composer-card] [contenteditable="true"],[data-composer-card] textarea')?.focus()`)
  assert.equal(await evaluate(`document.querySelector('.craft-workbench').contains(document.activeElement)`),true,'Background focus remains trapped')
  for (const [width,height] of [[1440,900],[900,500],[640,700],[390,700]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    await delay(100);await assertBounds('.craft-workbench')
    assert.equal(await evaluate(`document.querySelector('.craft-workbench-shade').getBoundingClientRect().top`),40)
    await capture(`desktop-map-${width}`)
  }
  await clickText('关闭')
  await clickText('打开会话书签')
  await waitFor(`!!document.querySelector('.craft-workbench-book')`)
  await assertBounds('.craft-workbench-book')
  await capture('desktop-notebook')
  await clickText('关闭')
  // A short viewport used to position the model popup over the native caption.
  await call('Emulation.setDeviceMetricsOverride',{width:640,height:320,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.querySelector('.craft-model-trigger').click()`)
  await waitFor(`!!document.querySelector('.craft-reasoning-popup')`)
  await delay(150);await assertBounds('.craft-reasoning-popup',48)
  await evaluate(`document.documentElement.dataset.fullscreen='true'`)
  await delay(150);await assertBounds('.craft-reasoning-popup',48)
  await evaluate(`window.desktopChromeFixture.hide()`)
  await delay(150);await assertBounds('.craft-reasoning-popup',8)
  await capture('desktop-reasoning-short')
  await key('Escape',27)
  await evaluate(`window.desktopChromeFixture.dispose()`)
  assert.deepEqual(errors,[])
  console.log('Desktop canary passed: bundled Windows runtime, actual caption-menu code with mocked native IPC, native handlers/focus retained, shadow skin restoration/replacement, settings/map/notebook/popover safe area, fullscreen, 2 palettes x 4 sizes x 3 scales. No model requests or daily-profile writes.')
})

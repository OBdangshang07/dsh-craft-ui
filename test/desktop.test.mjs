import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const css = await readFile(new URL('../src/client/desktop.css', import.meta.url),'utf8')
const source = await readFile(new URL('../src/client/desktop.ts', import.meta.url),'utf8')

test('Desktop keeps the shared Web client target instead of inventing a desktop platform', async () => {
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  assert.equal(pkg.dsh.client.platform,'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-theme'))
})

test('desktop safe-area CSS parses and follows the shell fullscreen markers', async () => {
  assert.deepEqual((await transform(css,{loader:'css',logLevel:'silent'})).warnings,[])
  assert.match(css,/html\[data-windows-titlebar\]:not\(\[data-fullscreen="true"\]\)/)
  assert.match(css,/--craft-chrome-top:var\(--dsh-windows-titlebar-height,40px\)/)
  assert.match(css,/html\[data-fullscreen="true"\]\{--craft-chrome-top:0px\}/)
  assert.match(css,/\[data-fullscreen="true"\]:has\(body>\[data-windows-menu\]\)/)
  assert.match(css,/\.craft-panel-shade,\.craft-workbench-shade\{top:var\(--craft-chrome-top\);-webkit-app-region:no-drag/)
  assert.match(css,/--craft-effective-zoom:1/)
})

test('caption skin owns only a reversible style in the existing open menu root', () => {
  assert.match(source,/host\.shadowRoot/)
  assert.match(source,/style\.dataset\.craftDesktopMenu/)
  assert.match(source,/root\.append\(style\)/)
  assert.match(source,/for \(const style of owned\.values\(\)\) style\.remove\(\)/)
  assert.match(source,/rootObserver\.disconnect\(\); menuObserver\.disconnect\(\)/)
  assert.doesNotMatch(source,/attachShadow|innerHTML|ipcRenderer|addEventListener\(/)
})

test('desktop popover placement and modal focus keep native caption controls available', async () => {
  const reasoning = await readFile(new URL('../src/client/components/ReasoningControl.tsx', import.meta.url),'utf8')
  const dialog = await readFile(new URL('../src/client/workbench/ui.tsx', import.meta.url),'utf8')
  assert.match(reasoning,/Math\.max\(top, desktopTopInset\(\)\)/)
  assert.match(reasoning,/chromeObserver\.disconnect\(\)/)
  assert.match(dialog,/if \(isDesktopMenuEvent\(event\)\) return/)
  assert.match(dialog,/!isDesktopMenuEvent\(event\)/)
  assert.match(source,/event\.composedPath\(\)/)
})

test('desktop caption lifecycle restores foreign nodes and releases every observer/subscription', async () => {
  const callbacks=[], listeners=new Set(), state={enabled:true}, attributes=new Set(['data-windows-titlebar'])
  class Element { matches(selector) { return selector==='[data-windows-menu]' } }
  class Root {
    children=[{native:true}]
    querySelector() { return this.children[0] }
    append(style) { this.children.push(style);style.owner=this }
  }
  class Observer {
    connected=true
    constructor(callback) {this.callback=callback;callbacks.push(this)}
    observe() {}
    disconnect() {this.connected=false}
  }
  const original=new Root(),replacement=new Root()
  const body={}
  let hosts=[Object.assign(new Element(),{shadowRoot:original,parentElement:body})]
  const document={documentElement:{hasAttribute:name=>attributes.has(name)},body,querySelectorAll:()=>hosts,
    createElement:()=>({dataset:{},remove(){const i=this.owner?.children.indexOf(this);if(i>=0)this.owner.children.splice(i,1)}})}
  const js=await transform(source.replace(/^import[^\n]*\n/,''),{loader:'ts',format:'iife',globalName:'desktop',target:'es2022'})
  const realm={document,HTMLElement:Element,MutationObserver:Observer,window:{innerHeight:1000},getComputedStyle:()=>({getPropertyValue:()=> '40px'}),getPreferences:()=>state,subscribePreferences:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}
  runInNewContext(js.code,realm)
  const {installDesktopSkin,desktopTopInset,isDesktopMenuEvent}=realm.desktop
  assert.equal(desktopTopInset(),40)
  assert.equal(isDesktopMenuEvent({composedPath:()=>[hosts[0]]}),true)
  const dispose=installDesktopSkin()
  assert.equal(original.children.length,2)
  for(const observer of callbacks)observer.callback()
  assert.equal(original.children.length,2,'Repeated scans must not duplicate the style')
  state.enabled=false;for(const listener of listeners)listener()
  assert.deepEqual(original.children,[{native:true}])
  state.enabled=true;for(const listener of listeners)listener()
  hosts=[Object.assign(new Element(),{shadowRoot:replacement,parentElement:body}),Object.assign(new Element(),{shadowRoot:null,parentElement:body})]
  for(const observer of callbacks)observer.callback()
  assert.deepEqual(original.children,[{native:true}])
  assert.equal(replacement.children.length,2)
  dispose()
  assert.deepEqual(replacement.children,[{native:true}])
  assert.equal(listeners.size,0)
  assert.ok(callbacks.every(observer=>!observer.connected))
  attributes.clear()
  assert.equal(isDesktopMenuEvent({composedPath:()=>[hosts[0]]}),false)
})

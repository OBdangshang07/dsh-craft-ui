import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('settings use Java Options navigation instead of desktop tabs and form controls', async () => {
  const source = await readFile(join(root, 'src/client/components/CraftPanel.tsx'), 'utf8')
  assert.match(source, /HUD 与玩法设置…/)
  assert.match(source, /素材与资源包…/)
  assert.match(source, /className="craft-options-grid"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.doesNotMatch(source, /<nav|<select|type="checkbox"/)
})

test('options screen keeps an independent menu background and removes dialog chrome', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  assert.match(css, /\.craft-panel-shade[^}]+__ASSET_DEEPSLATE__/)
  assert.match(css, /body\.craft-ui-enabled \.craft-control-panel\{border:0!important;box-shadow:none!important\}/)
})

test('composer uses the bundled pixel font and a glyph-height caret line box', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  assert.match(css, /@font-face\{font-family:"Craft Pixel";src:url\("__ASSET_FONT_UI__"\) format\("woff2"\)/)
  assert.match(css, /--craft-font:"Craft Pixel",ui-monospace/)
  assert.match(css, /\[data-composer-card\] :is\(textarea,input,\[contenteditable="true"\],\[role="textbox"\]\)[^{]*\{[^}]*font-family:"Craft Pixel"[^}]*font-size:16px!important[^}]*line-height:16px!important/)
  assert.match(css, /\[data-composer-card\] \[data-input-scroll\]>:has\(>textarea\)>\*[^}]*\{[^}]*font-family:"Craft Pixel"[^}]*font-size:16px!important[^}]*line-height:16px!important/)
  assert.match(css, /\[data-composer-card\][^{]*\{[^}]*filter:opacity\(1\)!important/)
  assert.match(css, /\[data-composer-card\] :is\(textarea,input,\[contenteditable="true"\],\[role="textbox"\]\)[^{]*\{[^}]*filter:none!important;text-shadow:none!important/)
  assert.doesNotMatch(css, /\[data-composer-card\][^}]*(?:-webkit-font-smoothing|text-shadow:[^;}]*1px)/)
  assert.match(css, /\[data-composer-card\].+::selection\{color:#111;background:#8fda61;text-shadow:none\}/)
})

test('passive XP bar hugs the composer instead of covering message metadata', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  assert.match(css, /\.craft-overlay-no-hotbar \.craft-xp\{[^}]*right:var\(--craft-composer-right,12px\);bottom:calc\(var\(--craft-hud-bottom,12px\) - 8px\)/)
})

test('active hotbar clears the native task dock and running status footer', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  const overlay = await readFile(join(root, 'src/client/components/CraftOverlay.tsx'), 'utf8')
  assert.match(overlay, /document\.querySelector\('\[data-composer-seat\]'\)/)
  assert.match(overlay, /resizeObserver\.observe\(composerSeat\)/)
  assert.match(overlay, /document\.body\.classList\.toggle\('craft-hotbar-active', active\)/)
  assert.match(overlay, /document\.body\.classList\.remove\('craft-hotbar-active'\)/)
  assert.match(css, /body\.craft-ui-enabled\.craft-hotbar-active \[data-chat-flow\]\{padding-bottom:var\(--craft-hotbar-reserve,80px\)!important\}/)
  assert.match(css, /body\[data-craft-scale="3"\]\{--craft-ui-zoom:1\.14;--craft-hotbar-reserve:92px\}/)
})

test('active goal uses a Minecraft task panel with a reserved XP footer', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  const overlay = await readFile(join(root, 'src/client/components/CraftOverlay.tsx'), 'utf8')
  assert.match(css, /\[data-goal-bar\]>div\{[^}]*height:82px!important[^}]*padding:6px 7px 31px!important[^}]*border-radius:0!important/)
  assert.match(css, /\[data-goal-bar\]>div:after\{[^}]*bottom:27px[^}]*background:#0b0d0b/)
  assert.match(css, /\.craft-overlay-no-hotbar\.craft-overlay-with-goal \.craft-xp\{[^}]*left:calc\(var\(--craft-composer-left,12px\) \+ 28px\)[^}]*bottom:var\(--craft-hud-bottom,12px\)[^}]*grid-template-columns:34px minmax\(120px,1fr\) 78px/)
  assert.match(overlay, /craft-overlay-with-goal/)
  assert.match(overlay, /--craft-composer-left/)
})

test('native composer popups take visual priority over the Minecraft bottom HUD', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  assert.match(css, /:has\(\[data-composer-card\] :is\(button\[aria-expanded="true"\],\[role="dialog"\],\[role="listbox"\],\[role="menu"\]\)\) :is\(\.craft-xp,\.craft-hotbar,\.craft-held-label\)\{opacity:0!important;visibility:hidden!important\}/)
  assert.match(css, /\[data-composer-card\] :has\(button\[aria-haspopup="dialog"\]\[aria-expanded="true"\]\)>\[role="dialog"\]\{z-index:1100!important\}/)
  assert.match(css, /@media\(min-width:1100px\)\{body\.craft-ui-enabled:has\(\[data-goal-bar\]\).+left:calc\(100% \+ 56px\)!important/)
  assert.match(css, /@media\(max-width:1099px\)\{body\.craft-ui-enabled:has\(\[data-goal-bar\]\).+bottom:calc\(100% \+ 168px\)!important/)
})

test('duplicate Boss Bar is removed in favor of the native goal task panel', async () => {
  const css = await readFile(join(root, 'src/client/style.css'), 'utf8')
  const overlay = await readFile(join(root, 'src/client/components/CraftOverlay.tsx'), 'utf8')
  const panel = await readFile(join(root, 'src/client/components/CraftPanel.tsx'), 'utf8')
  const types = await readFile(join(root, 'src/client/types.ts'), 'utf8')
  assert.doesNotMatch(css, /craft-boss/)
  assert.doesNotMatch(overlay, /craft-boss|goalProgress|goalPhaseLabel/)
  assert.doesNotMatch(panel, /Boss Bar|bossBar/)
  assert.doesNotMatch(types, /bossBar/)
})

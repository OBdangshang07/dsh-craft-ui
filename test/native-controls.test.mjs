import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transform } from 'esbuild'

const css = await readFile(new URL('../src/client/style.css', import.meta.url), 'utf8')

test('native-control CSS parses without malformed rules or nested media mistakes', async () => {
  const result = await transform(css, { loader: 'css', logLevel: 'silent' })
  assert.deepEqual(result.warnings, [])
  assert.doesNotMatch(css, /,\s*@media/)
})

test('switch geometry and state skin are scoped to enabled Craft UI', () => {
  assert.match(css, /button:not\(\.craft-close,\[role="switch"\],\[role="tab"\],\[role\^="menuitem"\]\)/)
  assert.match(css, /body\.craft-ui-enabled button\[role="switch"\]>span\{[^}]*border-radius:0!important/)
  assert.match(css, /body\.craft-ui-enabled button\[role="switch"\]\[aria-checked="true"\]>span\{transform:translateX\(22px\)!important/)
  assert.match(css, /button\[role="switch"\]:disabled\{[^}]*cursor:not-allowed/)
})

test('native selection, invalid, and disabled states retain distinct presentation', () => {
  for (const selector of ['input[type="checkbox"]:checked', 'input[type="checkbox"]:indeterminate',
    'input[type="radio"]:checked', '[aria-selected="true"]', '[aria-invalid="true"]',
    'button:disabled:not([aria-disabled="false"])']) assert.ok(css.includes(selector), selector)
  assert.match(css, /\[role="tablist"\]:not\(\[data-dockkit-strip\]\)/)
  assert.match(css, /body\.craft-ui-enabled select\{\s*appearance:none!important/)
})

test('switch movement honors user and OS reduced-motion preferences', () => {
  assert.match(css, /body\.craft-ui-enabled:is\(\[data-craft-motion="off"\],\[data-craft-motion="reduced"\]\) button\[role="switch"\]>span\{transition:none!important\}/)
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*button\[role="switch"\]>span\{animation:none!important;transition:none!important/)
})

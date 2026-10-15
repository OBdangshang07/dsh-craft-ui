import { getPreferences, subscribePreferences } from './store.ts'

/** Keep native caption controls outside page-owned dialogs and popovers. */
export function desktopTopInset(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--craft-chrome-top'))
  return Math.max(0, Math.min(window.innerHeight, Number.isFinite(value) ? value : 0))
}

/** Native menubar events cross an open ShadowRoot; do not trap its keyboard/focus. */
export function isDesktopMenuEvent(event: Event): boolean {
  return document.documentElement.hasAttribute('data-windows-titlebar') && event.composedPath().some(
    target => target instanceof HTMLElement && target.parentElement === document.body && target.matches('[data-windows-menu]'),
  )
}

// Only the page-owned caption buttons are skinned. Their nodes, native IPC,
// pointer handling, accessible names and roving keyboard navigation stay intact.
const MENU_CSS = `
:host { max-width:max(0px,calc(100vw - var(--dsh-windows-menu-start,48px) - 144px)); }
[role=menubar] { min-width:0;max-width:100%;gap:4px; }
button { box-sizing:border-box;min-width:0;flex:0 1 auto;height:28px;padding:0 8px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:2px solid;
  border-color:var(--craft-menu-light,#8e958b) var(--craft-menu-dark,#171b14) var(--craft-menu-dark,#171b14) var(--craft-menu-light,#8e958b);
  border-radius:0;background:var(--craft-menu-fill,#424a3f);color:var(--craft-menu-text,#f0edda);
  font:12px/20px var(--craft-font,monospace);text-shadow:1px 1px #0008;
  box-shadow:inset 1px 1px #ffffff18,inset -1px -1px #0004;-webkit-app-region:no-drag; }
button:hover,button[aria-expanded=true] { background:var(--craft-menu-hover,#596b50);color:#ffffa0; }
button:focus-visible { outline:2px solid var(--craft-menu-focus,#e5edb0);outline-offset:-3px; }
button:disabled { opacity:.5;cursor:not-allowed; }
@media(prefers-reduced-motion:reduce) { button { transition:none;animation:none; } }
`

/** Feature-detected and reversible: never replace the shell's menu or reach closed roots. */
export function installDesktopSkin(): () => void {
  const owned = new Map<ShadowRoot, HTMLStyleElement>()
  const sync = () => {
    const enabled = getPreferences().enabled && document.documentElement.hasAttribute('data-windows-titlebar')
    const roots = new Set<ShadowRoot>()
    if (enabled) for (const host of document.querySelectorAll('body > [data-windows-menu]')) {
      const root = host.shadowRoot
      if (!root || !root.querySelector('[role="menubar"]')) continue
      roots.add(root)
      if (!owned.has(root)) {
        const style = document.createElement('style')
        style.dataset.craftDesktopMenu = ''
        style.textContent = MENU_CSS
        root.append(style)
        owned.set(root, style)
      }
    }
    for (const [root, style] of owned) if (!roots.has(root)) { style.remove(); owned.delete(root) }
  }
  const rootObserver = new MutationObserver(sync)
  rootObserver.observe(document.documentElement, { attributes:true, attributeFilter:['data-windows-titlebar','data-fullscreen'] })
  // DSH appends/replaces the caption-menu host directly under body.
  const menuObserver = new MutationObserver(sync)
  menuObserver.observe(document.body, { childList:true })
  const unsubscribe = subscribePreferences(sync)
  sync()
  return () => {
    unsubscribe(); rootObserver.disconnect(); menuObserver.disconnect()
    for (const style of owned.values()) style.remove()
    owned.clear()
  }
}

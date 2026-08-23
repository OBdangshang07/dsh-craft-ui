import * as React from 'react'
import { CraftPanel } from './components/CraftPanel.tsx'
import { CraftOverlay } from './components/CraftOverlay.tsx'
import { ItemIcon } from './components/ItemIcon.tsx'
import { DAY_THEME, DEEPSLATE_THEME } from './theme.ts'
import { getPreferences, subscribePreferences } from './store.ts'
import { createResourcePackBridge } from './resource.ts'
import { installUiSounds } from './sound.ts'
import CSS from './generated-styles.ts'

export const inject = ['slots', 'theme', 'connection']

type ThemeService = {
  register: (definition: { id: string, colorScheme: 'light' | 'dark', tokens: Record<string, string> }) => () => void
  getTheme: () => { preference: string }
  setTheme: (id: string) => void
}

export function apply(ctx: any): void {
  const slots = ctx.get?.('slots') ?? ctx.slots
  const theme = (ctx.get?.('theme') ?? ctx.theme) as ThemeService | undefined
  const connection = ctx.get?.('connection') ?? ctx.connection
  const sessions = ctx.get?.('sessions') ?? ctx.sessions
  const resource = connection ? createResourcePackBridge(connection) : undefined
  if (!slots) return
  let themesReady = false
  let previousTheme: string | undefined

  ctx.effect(() => {
    const previousDark = document.body.hasAttribute('data-ds-dark-theme')
    const previousColorScheme = document.documentElement.style.colorScheme
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-craft-ui'
    style.textContent = CSS
    document.head.append(style)
    const applyPreferences = () => {
      const prefs = getPreferences()
      document.body.classList.toggle('craft-ui-enabled', prefs.enabled)
      document.body.classList.toggle('craft-atmosphere', prefs.enabled && prefs.atmosphere)
      document.body.dataset.craftTheme = prefs.theme
      document.body.dataset.craftMotion = prefs.motion
      document.body.dataset.craftScale = String(prefs.scale)
      if (prefs.enabled) {
        const dark = prefs.theme === 'craft-deepslate'
        document.body.toggleAttribute('data-ds-dark-theme', dark)
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      } else {
        document.body.toggleAttribute('data-ds-dark-theme', previousDark)
        document.documentElement.style.colorScheme = previousColorScheme
      }
      document.documentElement.style.setProperty('--craft-scale', String(prefs.scale))
      if (theme && themesReady) {
        if (prefs.enabled) theme.setTheme(prefs.theme)
        else if (previousTheme) theme.setTheme(previousTheme)
      }
    }
    applyPreferences()
    const unsubscribe = subscribePreferences(applyPreferences)
    const paletteObserver = new MutationObserver(() => {
      const prefs = getPreferences()
      if (!prefs.enabled) return
      const desired = prefs.theme === 'craft-deepslate'
      if (document.body.hasAttribute('data-ds-dark-theme') !== desired) queueMicrotask(applyPreferences)
    })
    paletteObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => {
      paletteObserver.disconnect()
      unsubscribe()
      delete document.body.dataset.craftTheme
      delete document.body.dataset.craftMotion
      delete document.body.dataset.craftScale
      document.body.classList.remove('craft-ui-enabled', 'craft-atmosphere')
      document.documentElement.style.removeProperty('--craft-scale')
      document.body.toggleAttribute('data-ds-dark-theme', previousDark)
      document.documentElement.style.colorScheme = previousColorScheme
      style.remove()
    }
  }, 'craft-ui: styles and preferences')

  ctx.effect(installUiSounds, 'craft-ui: synthesized interface sounds')

  if (theme) {
    ctx.effect(() => {
      const previous = theme.getTheme().preference
      previousTheme = previous
      const disposeDay = theme.register(DAY_THEME)
      const disposeNight = theme.register(DEEPSLATE_THEME)
      themesReady = true
      if (getPreferences().enabled) theme.setTheme(getPreferences().theme)
      return () => {
        themesReady = false
        previousTheme = undefined
        disposeNight()
        disposeDay()
        theme.setTheme(previous)
      }
    }, 'craft-ui: theme registrations')
    ctx.on('theme/change', (snapshot: { preference: string }) => {
      const prefs = getPreferences()
      if (themesReady && prefs.enabled && snapshot.preference !== prefs.theme) theme.setTheme(prefs.theme)
    })
  }

  let closePanel: (() => void) | null = null
  const Toggle = () => {
    const [open, setOpen] = React.useState(false)
    closePanel = () => setOpen(false)
    return <>
      <button className="craft-sidebar-button" onClick={() => setOpen(value => !value)} title="DSH Craft UI"><ItemIcon item="hopper" size={22} /></button>
      {open && <CraftPanel onClose={() => setOpen(false)} resource={resource} />}
    </>
  }

  ctx.effect(() => slots.inject('sidebar.footer.action', () => slots.register(
    { name: 'sidebar.footer.action', id: 'craft-ui-settings', order: -90, label: 'Craft UI' },
    Toggle,
  )), 'craft-ui: sidebar settings')

  ctx.effect(() => slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'craft-ui-overlay', order: 900 },
    (props: any) => <CraftOverlay {...props} sessions={sessions} />,
  )), 'craft-ui: gameplay overlay')

  if (resource?.isLoopback) ctx.effect(() => {
    void resource.refreshTheme().catch(error => console.warn('[dsh-craft-ui] local resource theme unavailable:', error))
    return () => {
      delete document.body.dataset.craftAssets
      delete document.body.dataset.craftItems
      for (const name of Array.from(document.documentElement.style)) if (name.startsWith('--craft-import-')) document.documentElement.style.removeProperty(name)
    }
  }, 'craft-ui: local resource theme')

  ctx.effect(() => () => closePanel?.(), 'craft-ui: panel cleanup')
}

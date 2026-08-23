import { useSyncExternalStore } from 'react'
import { DEFAULT_PREFERENCES, type CraftPreferences } from './types.ts'

const KEY = 'dsh-craft-ui/preferences/v1'
const listeners = new Set<() => void>()

function load(): CraftPreferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const row = JSON.parse(raw) as Partial<CraftPreferences>
    return { ...DEFAULT_PREFERENCES, ...row }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

let snapshot = typeof localStorage === 'undefined' ? DEFAULT_PREFERENCES : load()

export function getPreferences(): CraftPreferences {
  return snapshot
}

export function setPreferences(patch: Partial<CraftPreferences>): void {
  snapshot = { ...snapshot, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)) } catch {}
  for (const listener of listeners) listener()
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePreferences(): CraftPreferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, () => DEFAULT_PREFERENCES)
}

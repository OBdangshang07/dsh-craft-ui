import { getPreferences } from './store.ts'

type AudioContextConstructor = typeof AudioContext

let context: AudioContext | undefined

function audio(): AudioContext | undefined {
  const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  if (!Constructor) return undefined
  context ??= new Constructor()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(frequency: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'square'): void {
  const ctx = audio()
  if (!ctx) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playAdvancementSound(): void {
  if (!getPreferences().sounds) return
  tone(523.25, 0.13, 0.035)
  tone(659.25, 0.15, 0.032, 0.1)
  tone(783.99, 0.28, 0.028, 0.2)
}

export function installUiSounds(): () => void {
  const listener = (event: PointerEvent) => {
    if (!getPreferences().enabled || !getPreferences().sounds || event.button !== 0) return
    const target = event.target instanceof Element
      ? event.target.closest('button, input[type="checkbox"], input[type="radio"], select, [role="button"]')
      : null
    if (!target || target.matches(':disabled, [aria-disabled="true"]')) return
    tone(target.matches('input, select') ? 360 : 295, 0.045, 0.018)
  }
  document.addEventListener('pointerdown', listener, true)
  return () => {
    document.removeEventListener('pointerdown', listener, true)
    void context?.close()
    context = undefined
  }
}

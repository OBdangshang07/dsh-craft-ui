import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ItemIcon } from '../components/ItemIcon.tsx'

export function useTranslate() {
  const [language, setLanguage] = useState(() => document.documentElement.lang || navigator.language)
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang || navigator.language))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  return (zh: string, en: string) => language.toLowerCase().startsWith('zh') ? zh : en
}
export function CraftDialog({ title, icon = 'map', children, onClose, wide = false }: { title: string, icon?: 'map' | 'book', children: ReactNode, onClose: () => void, wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  const tr = useTranslate()
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const node = panel.current!
    const controls = () => [...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(e => e.getClientRects().length > 0)
    ;(controls()[0] ?? node).focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if ([...document.querySelectorAll('.craft-workbench')].at(-1) !== node) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const items = controls(), index = items.indexOf(document.activeElement as HTMLElement)
      if (!items.length) { event.preventDefault(); node.focus(); return }
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)!.focus() }
      else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus() }
    }
    const holdFocus = (event: FocusEvent) => { if ([...document.querySelectorAll('.craft-workbench')].at(-1) === node && !node.contains(event.target as Node)) (controls()[0] ?? node).focus({ preventScroll: true }) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', holdFocus)
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', holdFocus); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<div className="craft-workbench-shade"><div ref={panel} tabIndex={-1} className={`craft-workbench craft-workbench-${wide ? 'wide' : 'book'}`} role="dialog" aria-modal="true" aria-label={title}>
    <header className="craft-workbench-header"><ItemIcon item={icon} size={28} /><h2>{title}</h2><button onClick={onClose} aria-label={tr('关闭', 'Close')}>×</button></header>
    {children}
  </div></div>, document.body)
}
export function downloadText(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

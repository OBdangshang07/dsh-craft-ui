import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { ItemIcon } from './ItemIcon.tsx'
import { usePreferences } from '../store.ts'
import { projectGameplay, type ConversationLike, type SessionListLike } from '../gameplay.ts'
import { makeHotbarSlots, shortTool, toolItem } from '../hotbar.ts'
import { playAdvancementSound } from '../sound.ts'

type ObservableConversation = { getSnapshot(): ConversationLike, subscribe(listener: () => void): () => void }
type SessionsFace = { binding(id: string): { session: ObservableConversation } | undefined }
type OverlayProps = { useSessions: <T>(selector: (state: SessionListLike) => T) => T, sessions?: SessionsFace }
const EMPTY_CONVERSATION: ConversationLike = { running: false, runningCalls: [], pending: [], nodes: [] }
const emptySubscribe = () => () => {}

export function CraftOverlay({ useSessions, sessions }: OverlayProps) {
  const prefs = usePreferences()
  const composerClearance = useComposerClearance()
  const list = useSessions(row => row)
  const binding = list.current ? sessions?.binding(list.current) : undefined
  const conversation = useSyncExternalStore(
    binding ? listener => binding.session.subscribe(listener) : emptySubscribe,
    binding ? () => binding.session.getSnapshot() : () => EMPTY_CONVERSATION,
    () => EMPTY_CONVERSATION,
  )
  const view = projectGameplay(list, conversation)
  const level = Math.round(view.context.ratio * 100)
  const contextAvailable = view.context.used !== undefined && view.context.capacity !== undefined
  const state = level >= 85 ? 'danger' : level >= 65 ? 'warn' : 'ok'
  const particles = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    left: `${(index * 37 + 11) % 100}%`, delay: `${(index * 0.43) % 3.4}s`, duration: `${4.4 + (index % 5) * 0.7}s`,
  })), [])
  const previousRunning = useRef(view.running)
  const [advancement, setAdvancement] = useState(false)
  useEffect(() => {
    if (prefs.advancements && previousRunning.current && !view.running) {
      setAdvancement(true)
      playAdvancementSound()
      const timer = window.setTimeout(() => setAdvancement(false), 4200)
      previousRunning.current = view.running
      return () => window.clearTimeout(timer)
    }
    previousRunning.current = view.running
  }, [prefs.advancements, view.running])
  const done = view.todos.filter(todo => todo.status === 'completed').length
  const activeTodo = view.todos.find(todo => todo.status === 'in_progress') ?? view.todos.find(todo => todo.status === 'pending')
  const slots = makeHotbarSlots(view)
  const selectedSlot = view.tools.length > 0 ? 0 : slots[4] ? 4 : slots.findIndex(Boolean)
  const hotbarVisible = prefs.hotbar && slots.some(Boolean) && (view.tools.length > 0 || view.pending > 0 || view.agents.some(agent => agent.running))
  const goalVisible = Boolean(view.goal && view.goal.phase !== 'complete')
  useEffect(() => {
    const active = Boolean(prefs.enabled && list.current && hotbarVisible)
    document.body.classList.toggle('craft-hotbar-active', active)
    return () => document.body.classList.remove('craft-hotbar-active')
  }, [hotbarVisible, list.current, prefs.enabled])
  if (!prefs.enabled || !list.current) return null
  return <div className={`craft-overlay ${hotbarVisible ? 'craft-overlay-with-hotbar' : 'craft-overlay-no-hotbar'} ${goalVisible ? 'craft-overlay-with-goal' : ''}`} aria-hidden="true" style={{ '--craft-hud-bottom': `${composerClearance.bottom}px`, '--craft-composer-left': `${composerClearance.left}px`, '--craft-composer-right': `${composerClearance.right}px` } as CSSProperties}>
    {prefs.atmosphere && <div className="craft-particles">{particles.map((p, i) => <i key={i} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }} />)}</div>}
    {prefs.equipment && (view.model || view.reasoning) && <div className={`craft-equipment ${view.reasoning ? 'craft-enchanted' : ''}`}><ItemIcon item="helmet" /><span><small>{view.provider ?? 'MODEL EQUIPMENT'}</small><b>{view.model ?? 'Unknown model'}</b>{view.reasoning && <em>✦ {view.reasoning} enchantment</em>}</span></div>}
    {prefs.agentList && view.agents.length > 0 && <div className="craft-player-list"><header><ItemIcon item="agent" size={20} /> COMPANIONS</header>{view.agents.slice(0, 6).map(agent => <div key={agent.id}><i className={agent.running ? 'online' : ''} /><span>{agent.label}</span><small>{agent.running ? 'WORKING' : 'IDLE'}</small></div>)}</div>}
    {prefs.questBook && view.todos.length > 0 && <div className="craft-quest"><header><ItemIcon item="book" size={22} /> QUEST LOG</header><b>{activeTodo?.content ?? 'All quests completed'}</b><span>{done}/{view.todos.length} COMPLETE{view.planActive ? ' · PLAN MODE' : ''}</span></div>}
    {hotbarVisible && <><div key={selectedSlot >= 0 ? slots[selectedSlot]?.title : 'none'} className="craft-held-label">{selectedSlot >= 0 ? slots[selectedSlot]?.title : ''}</div><div className={`craft-hotbar ${view.tools.length > 0 ? 'craft-hotbar-busy' : ''}`}>{slots.map((slot, index) => <div key={index} className={`${slot?.active ? 'active' : ''} ${index === selectedSlot ? 'selected' : ''}`} title={slot?.title}><small>{index + 1}</small>{slot && <><ItemIcon item={slot.item} size={32} /><b>{slot.label}</b>{slot.count && slot.count > 1 ? <em>{slot.count}</em> : null}</>}</div>)}</div></>}
    {prefs.xpBar && contextAvailable && <div className={`craft-xp craft-xp-${state}`} title={contextTitle(view.context.used, view.context.capacity, level)}><b>{Math.max(1, Math.round((100 - level) / 5))}</b><span><i style={{ width: `${level}%` }} /></span><small>{`CONTEXT ${level}%`}</small></div>}
    {view.tools.length > 0 && <div className="craft-tool-toast"><ItemIcon item={toolItem(view.tools[0]?.name ?? '')} /><span><b>{view.tools[0]?.name}</b><small>{view.tools.length > 1 ? `另有 ${view.tools.length - 1} 个工具运行中` : '工具正在执行'}</small></span></div>}
    {view.pending > 0 && <div className="craft-approval"><ItemIcon item="redstone" size={20} /> 等待 {view.pending} 项确认</div>}
    {advancement && <div className="craft-advancement"><ItemIcon item="emerald" /><span><small>ADVANCEMENT MADE!</small><b>Harness turn complete</b></span></div>}
  </div>
}

function useComposerClearance(): { bottom: number, left: number, right: number } {
  const [clearance, setClearance] = useState({ bottom: 12, left: 12, right: 12 })
  useEffect(() => {
    let composer: Element | null = null
    let composerSeat: Element | null = null
    let resizeObserver: ResizeObserver | undefined
    const update = () => {
      const nextComposer = document.querySelector('[data-composer-card]')
      const nextSeat = document.querySelector('[data-composer-seat]')
      if (nextComposer !== composer || nextSeat !== composerSeat) {
        resizeObserver?.disconnect()
        composer = nextComposer
        composerSeat = nextSeat
        if ((composer || composerSeat) && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(update)
          if (composer) resizeObserver.observe(composer)
          if (composerSeat && composerSeat !== composer) resizeObserver.observe(composerSeat)
        }
      }
      const composerRect = composer?.getBoundingClientRect()
      const seatRect = composerSeat?.getBoundingClientRect()
      const zoom = Math.max(.5, Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--craft-ui-zoom')) || 1)
      const top = seatRect?.top ?? composerRect?.top
      const value = typeof top === 'number' && top > window.innerHeight * .55
        ? Math.max(12, Math.round((window.innerHeight - top + 12) / zoom))
        : 12
      const left = composerRect ? Math.max(12, Math.round((composerRect.left + 12) / zoom)) : 12
      const right = composerRect ? Math.max(12, Math.round((window.innerWidth - composerRect.right + 12) / zoom)) : 12
      setClearance(current => current.bottom === value && current.left === left && current.right === right ? current : { bottom: value, left, right })
    }
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-craft-scale'] })
    window.addEventListener('resize', update)
    update()
    return () => {
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return clearance
}

function contextTitle(used: number | undefined, capacity: number | undefined, level: number): string {
  return used !== undefined && capacity !== undefined ? `Context ${used.toLocaleString()} / ${capacity.toLocaleString()} tokens (${level}%)` : 'Context pressure unavailable'
}

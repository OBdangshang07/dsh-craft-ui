import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { defaultSelection, effortSelection, reasoningView, type ModelSelection, type ModelState } from '../reasoning.ts'
import { getPreferences, subscribePreferences } from '../store.ts'
import { useTranslate } from '../workbench/ui.tsx'
import { ItemIcon } from './ItemIcon.tsx'

interface Directory {
  store: { subscribe: (fn: () => void) => () => void, getSnapshot: () => ModelState }
  load: () => Promise<unknown>
  select: (selection: ModelSelection) => Promise<{ ok: boolean, error?: { code?: string, message?: string } }>
}
export function ReasoningControl({ directory, locked, available }: { directory: Directory, locked: boolean, available: boolean }) {
  const tr = useTranslate(), id = useId()
  const subscribe = useCallback((fn: () => void) => directory.store.subscribe(fn), [directory])
  const state = useSyncExternalStore(subscribe, () => directory.store.getSnapshot()), view = reasoningView(state)
  const [open, setOpen] = useState(false), [models, setModels] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<number>(), pending = useRef<{ index: number, identity: string }>()
  const inFlight = useRef(false), alive = useRef(true)
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const inactive = locked || busy || state.status === 'selecting' || state.status === 'loading'
  const shown = preview ?? view.index, label = shown < 0 ? view.label : view.levels[shown]?.name ?? view.label
  const modelName = view.model?.name ?? (state.current ? `${state.current.provider}/${state.current.model}` : tr('选择模型', 'Select model'))
  const discard = () => { pending.current = undefined; setPreview(undefined) }
  const close = (restore = false) => { discard(); setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }) }
  const reload = useCallback(() => { void directory.load().catch(() => {}) }, [directory])
  useEffect(() => { alive.current = true; if (available) reload(); return () => { alive.current = false } }, [directory, available, reload])
  useEffect(() => { discard() }, [view.identity, state.status])
  useEffect(() => { if (locked || !available) close() }, [locked, available])
  const select = async (selection: ModelSelection) => {
    if (inactive || !available || inFlight.current) return
    const focused = document.activeElement as HTMLElement | null
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await directory.select(selection)
      if (!result.ok) throw new Error(result.error?.code === 'session/writer-held' ? tr('会话正由另一实例使用，请关闭其他 DSH 实例后重试。', 'Another DSH instance owns this Session. Close it and retry.') : result.error?.message || tr('切换失败，请重试。', 'Selection failed. Please retry.'))
      if (alive.current) setModels(false)
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally {
      inFlight.current = false
      if (alive.current) {
        setBusy(false); discard()
        // Disabling the range during the write may blur it. Keep successive
        // keyboard adjustments usable, but never steal focus from another control.
        requestAnimationFrame(() => { if (alive.current && focused?.isConnected && popup.current?.contains(focused) && document.activeElement === document.body) focused.focus({ preventScroll: true }) })
      }
    }
  }
  const commit = () => {
    const change = pending.current; discard()
    if (!change) return
    const current = directory.store.getSnapshot()
    const selection = effortSelection(current, change.identity, change.index)
    if (selection && reasoningView(current).index !== change.index) void select(selection)
  }
  const previewAt = (index: number) => {
    if (inactive) return
    pending.current = { index, identity: pending.current?.identity ?? view.identity }; setPreview(index)
  }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect(), box = popup.current
      if (!rect || !box) return
      const viewport = window.visualViewport, left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight
      setPosition({ left: Math.max(left + 8, Math.min(rect.right - box.offsetWidth, left + width - box.offsetWidth - 8)), top: Math.max(top + 8, Math.min(rect.top - box.offsetHeight - 8, top + height - box.offsetHeight - 8)) })
    }
    place()
    const observer = new ResizeObserver(place); if (popup.current) observer.observe(popup.current)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.visualViewport?.removeEventListener('resize', place) }
  }, [open, models])
  useEffect(() => {
    if (!open) return
    const focus = requestAnimationFrame(() => (popup.current?.querySelector<HTMLElement>(models ? '[aria-checked="true"],button:not(:disabled)' : 'input:not(:disabled),button:not(:disabled)'))?.focus({ preventScroll: true }))
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside, true)
    return () => { cancelAnimationFrame(focus); document.removeEventListener('pointerdown', outside, true) }
  }, [open, models])
  if (!available) return null
  return <div className="craft-model-control">
    <button ref={trigger} type="button" className="craft-model-trigger" disabled={locked} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={tr(`选择模型，当前 ${modelName}${view.label ? `，推理等级 ${view.label}` : ''}`, `Select model, current ${modelName}${view.label ? `, effort ${view.label}` : ''}`)} title={`${modelName}${view.label ? ` · ${view.label}` : ''}`} onClick={() => { if (open) close(); else { setModels(false); setOpen(true); reload() } }}><span className="craft-model-icon"><ItemIcon item="book" size={18} /></span><span className="craft-model-name">{modelName}</span>{view.label && <span className="craft-model-effort">{view.label}</span>}<span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
    {open && createPortal(<div ref={popup} id={id} role="dialog" aria-label={tr('模型与推理等级', 'Model and reasoning effort')} className="craft-reasoning-popup" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); discard(); models ? setModels(false) : close(true) }
      if (event.key === 'Tab') {
        const items = [...popup.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')], index = items.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus() }
        else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus() }
      }
    }}>
      {models ? <><header><button type="button" onClick={() => setModels(false)} aria-label={tr('返回推理等级', 'Back to reasoning')}>◀</button><b>{tr('选择模型', 'Select model')}</b><button type="button" onClick={() => close(true)} aria-label={tr('关闭', 'Close')}>×</button></header><div className="craft-model-list" role="menu" aria-label={tr('可用模型', 'Available models')}>
        {state.groups.map(group => <section key={group.id}><h3>{group.name}</h3>{group.models.map(model => <button type="button" key={model.id} role="menuitemradio" aria-checked={state.current?.provider === group.id && state.current.model === model.id} disabled={inactive} title={model.description} onClick={() => { if (state.current?.provider === group.id && state.current.model === model.id) setModels(false); else void select(defaultSelection(group.id, model)) }}>{model.name}<span aria-hidden="true">{state.current?.provider === group.id && state.current.model === model.id ? '✓' : ''}</span></button>)}</section>)}
        {state.failures.map(failure => <p key={failure.id} role="status">{failure.name}: {failure.message}</p>)}{!state.groups.length && <p>{tr('暂无可用模型，请刷新。', 'No model catalog available. Try reloading.')}</p>}
      </div></> : <>
        <header className="craft-model-heading"><button type="button" className="craft-reasoning-model" title={tr(`切换模型，当前 ${modelName}`, `Change model, current ${modelName}`)} aria-label={tr(`切换模型，当前 ${modelName}`, `Change model, current ${modelName}`)} aria-haspopup="menu" onClick={() => { discard(); setModels(true) }}><span className="craft-model-caption">{tr('模型', 'Model')}</span><span className="craft-model-current">{modelName}</span><span className="craft-model-change">{tr('切换', 'Change')} <span aria-hidden="true">▾</span></span></button><button type="button" aria-label={tr('关闭', 'Close')} onClick={() => close(true)}>×</button></header>
        <div className="craft-reasoning-heading"><span>{tr('推理等级', 'Reasoning effort')}</span><strong aria-live="polite">{label || tr('未提供', 'Unavailable')}{preview !== undefined ? ' *' : ''}</strong><button type="button" className="craft-effort-reset" disabled={inactive || !view.model?.reasoning || !state.current} title={tr('恢复此模型的默认等级', 'Restore this model’s default effort')} aria-label={tr('恢复默认推理等级', 'Reset reasoning effort')} onClick={() => { if (state.current && view.model) void select(defaultSelection(state.current.provider, view.model)) }}>↺</button></div>
        {view.levels.length > 0 ? <div className="craft-effort-slider" data-unmapped={shown < 0 || undefined} style={{ '--craft-effort-count': view.levels.length, '--craft-effort-progress': `${100 * Math.max(0, shown) / Math.max(1, view.levels.length - 1)}%` } as CSSProperties}>
          <div className="craft-effort-track" aria-hidden="true"><i />{view.levels.map((level, i) => <span key={level.id ?? 'default'} data-active={shown >= i || undefined} style={{ left: `${100 * i / Math.max(1, view.levels.length - 1)}%` }} />)}</div>
          <input type="range" min="0" max={Math.max(1, view.levels.length - 1)} step="1" value={Math.max(0, shown)} disabled={inactive || view.levels.length < 2} aria-label={tr('推理等级', 'Reasoning effort')} aria-valuetext={label || tr('未知等级，尚未更改', 'Unknown effort; unchanged')} onChange={event => previewAt(Number(event.currentTarget.value))} onPointerUp={commit} onPointerCancel={discard} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit() }} onBlur={commit} />
          <div className="craft-effort-labels">{view.levels.map((level, i) => <button type="button" key={level.id ?? 'default'} disabled={inactive} aria-pressed={shown === i} title={level.name} onClick={() => { previewAt(i); commit() }}>{level.name}</button>)}</div>
        </div> : <p className="craft-reasoning-hint">{tr('当前模型未提供可调推理等级。', 'This model does not advertise adjustable reasoning effort.')}</p>}
        {view.levels.length > 0 && view.index < 0 && <p className="craft-reasoning-hint">{tr('当前等级未出现在目录中，已保留；请主动选择支持的档位。', 'The current effort is not in the catalog and is unchanged. Choose a supported level explicitly.')}</p>}
        <p className="craft-reasoning-hint" title={tr('松手后应用于下一次请求，不中断当前运行。', 'Applies on release to the next request; current work is unchanged.')}>{busy ? tr('正在应用…', 'Applying…') : tr('松手应用 · 不打断任务', 'Applies on release · next request')}</p>
      </>}
      {(error || state.error || state.status === 'loading' || state.routable === false) && <p className="craft-reasoning-status" role="status">{error || state.error || (state.status === 'loading' ? tr('正在加载…', 'Loading…') : tr('当前模型路由不可用，请选择其他模型。', 'Current model route unavailable. Choose another model.'))}<button type="button" disabled={busy} onClick={() => { setError(''); reload() }}>{tr('刷新', 'Reload')}</button></p>}
    </div>, document.body)}
  </div>
}

/** Register only while enabled; legacy mode restores the upstream occupant. */
export function installReasoningControl(ctx: any) {
  // 0.1.7 Cordis traces service method calls through the caller's context, so
  // directoryFor needs its transitive remote.session dependency declared here.
  ctx.inject(['modelDirectories', 'sessions', 'remote', 'remote.session'], (scope: any) => {
    const models = scope.modelDirectories, sessions = scope.sessions
    const Control = (props: any) => <ReasoningControl key={props.sessionId} directory={props.directory} available={props.available} locked={props.locked} />
    scope.effect(() => {
      let remove: (() => void) | undefined
      const update = () => {
        const preferences = getPreferences()
        if (preferences.enabled && preferences.reasoningControl !== 'menu') {
          if (!remove) remove = scope.slots.inject('conversation.input.model', () => scope.slots.register({ name: 'conversation.input.model', priority: -100, inject: (sessionId: string) => ({ directory: models.directoryFor(sessionId), available: sessions.subagentAddress(sessionId) === undefined }) }, Control))
        } else { remove?.(); remove = undefined }
      }
      update(); const unsubscribe = subscribePreferences(update)
      return () => { unsubscribe(); remove?.() }
    }, 'craft-ui: optional reasoning slider')
  })
}

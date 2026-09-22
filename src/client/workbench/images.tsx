import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { feedbackText, normalizedRegion, type Region, type ViewedImage } from '../../workbench.ts'
import { usePreferences } from '../store.ts'
import { ItemIcon } from '../components/ItemIcon.tsx'
import { CraftDialog, useTranslate } from './ui.tsx'
import type { NotebookBridge } from './bridge.ts'
import { downloadImage, markedImage } from './export-image.ts'

export type ImageLoader = (ref: ViewedImage['attachment']) => Promise<string>
function useImage(image: ViewedImage, load: ImageLoader, active = true) {
  const [state, setState] = useState({ url: '', error: '', retry: 0 })
  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, url: '', error: '' }))
    if (active) void load(image.attachment).then(url => { if (alive) setState(s => ({ ...s, url })) }, () => { if (alive) setState(s => ({ ...s, error: 'unavailable' })) })
    return () => { alive = false }
  }, [image.attachment.attachmentId, load, active, state.retry])
  return { ...state, retry: () => setState(s => ({ ...s, retry: s.retry + 1 })), failed: () => setState(s => ({ ...s, url: '', error: 'decode' })) }
}
function Thumbnail({ image, load, onOpen }: { image: ViewedImage, load: ImageLoader, onOpen: () => void }) {
  const tr = useTranslate(), ref = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false)
  const state = useImage(image, load, visible)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '120px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const label = image.path.split(/[\\/]/).pop() || image.attachment.name || tr('图像', 'Image')
  return <div className="craft-map-tile" ref={ref}>
    <button className="craft-map-preview" onClick={state.error ? state.retry : onOpen} title={`${image.path}\n${image.attachment.width}×${image.attachment.height}\n${tr('读取时附件', 'Attachment at read time')} · #${image.seq}`} aria-label={`${state.error ? tr('重试', 'Retry') : tr('查看', 'View')} ${label}`}>
      {state.url ? <img src={state.url} alt={label} decoding="async" onError={state.failed} /> : <span>{state.error ? tr('不可用 · 重试', 'Unavailable · Retry') : tr('载入中…', 'Loading…')}</span>}
    </button><span className="craft-map-name" title={image.path}>{label}</span><small>{image.attachment.width} × {image.attachment.height}{image.reads > 1 ? ` · ×${image.reads}` : ''}</small>
  </div>
}
export function ImageGallery({ images, load, bridge, append, inspect }: { images: ViewedImage[], load: ImageLoader, bridge: NotebookBridge, append: (text: string) => boolean, inspect?: (image: ViewedImage) => void }) {
  const tr = useTranslate(), prefs = usePreferences()
  const [expanded, setExpanded] = useState(true), [limit, setLimit] = useState(3), [selected, setSelected] = useState<number | null>(null)
  if (!images.length) return null
  return <section className="craft-image-journal" aria-label={tr('已读取图像', 'Read images')}>
    <header><button className="craft-gallery-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ItemIcon item="map" size={20} />{expanded ? '▾' : '▸'} {tr(`已读取 ${images.length} 张图像`, `Read ${images.length} images`)}</button><small>{tr('读取时版本', 'At read time')}</small></header>
    {expanded && <><div className="craft-map-grid">{images.slice(0, limit).map((image, index) => <Thumbnail key={image.key} image={image} load={load} onOpen={() => setSelected(index)} />)}</div>
      {images.length > limit && <button className="craft-more" onClick={() => setLimit(n => n + 12)}>{tr(`更多图像（${images.length - limit}）`, `More images (${images.length - limit})`)}</button>}
      {images.length > 1 && prefs.imageWorkbench && <button className="craft-more" onClick={() => setSelected(0)}>{tr('打开图片工作台 / 对比', 'Open image workbench / Compare')}</button>}
    </>}
    {selected !== null && <ImageWorkbench key={`${bridge.sessionId}:${images[selected]?.key}`} images={images} initial={selected} load={load} bridge={bridge} append={append} inspect={inspect} onClose={() => setSelected(null)} />}
  </section>
}

export function ImageWorkbench({ images, initial, load, bridge, append, inspect, onClose }: { images: ViewedImage[], initial: number, load: ImageLoader, bridge: NotebookBridge, append: (text: string) => boolean, inspect?: (image: ViewedImage) => void, onClose: () => void }) {
  const tr = useTranslate(), prefs = usePreferences()
  const [index, setIndex] = useState(initial), [other, setOther] = useState(initial === 0 ? 1 : 0)
  const [mode, setMode] = useState<'single' | 'compare' | 'wipe'>('single'), [zoom, setZoom] = useState(0), [pixel, setPixel] = useState(false), [wipe, setWipe] = useState(50)
  const [tool, setTool] = useState<'pan' | 'mark'>('pan'), [region, setRegion] = useState<Region>(), [note, setNote] = useState(''), [message, setMessage] = useState('')
  const [editing, setEditing] = useState<string>(), [busy, setBusy] = useState(false)
  const [leave, setLeave] = useState<{ action: () => void }>()
  const snapshot = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
  const image = images[index], right = images[other] ?? image
  const sameSize = image.attachment.width === right.attachment.width && image.attachment.height === right.attachment.height
  const saved = snapshot.data.entries.find(e => e.id === editing)
  const dirty = note !== (saved?.note ?? '') || JSON.stringify(region) !== JSON.stringify(saved?.region)
  const askLeave = (action: () => void) => { if (busy) return; if (dirty) setLeave({ action }); else action() }
  const switchImage = (next: number) => { if (next !== index) askLeave(() => setIndex(next)) }
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { void bridge.load() }, [bridge])
  useEffect(() => { setRegion(undefined); setEditing(undefined); setNote(''); setMessage(''); setZoom(0) }, [index])
  useEffect(() => { if (index === other) setOther(index === 0 ? 1 : 0) }, [index, other])
  useEffect(() => { if (!sameSize && mode === 'wipe') setMode('compare') }, [sameSize, mode])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,button')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); switchImage(Math.max(0, index - 1)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); switchImage(Math.min(images.length - 1, index + 1)) }
    }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [images.length, index, dirty, busy])
  const scrollers = useRef<Array<HTMLDivElement | null>>([])
  const sync = (origin: HTMLDivElement) => {
    for (const pane of scrollers.current) if (pane && pane !== origin) {
      const x = origin.scrollLeft / Math.max(1, origin.scrollWidth - origin.clientWidth), y = origin.scrollTop / Math.max(1, origin.scrollHeight - origin.clientHeight)
      const left = x * (pane.scrollWidth - pane.clientWidth), top = y * (pane.scrollHeight - pane.clientHeight)
      if (Math.abs(pane.scrollLeft - left) > 1) pane.scrollLeft = left
      if (Math.abs(pane.scrollTop - top) > 1) pane.scrollTop = top
    }
  }
  const save = async () => {
    if (!region || !note.trim()) return
    setBusy(true); setMessage('')
    try {
      const id = editing ?? crypto.randomUUID()
      await bridge.mutate('save', { id, seq: image.seq, kind: 'annotation', text: image.path, note, tags: '', attachmentId: image.attachment.attachmentId, region, history: [], time: Date.now() })
      setEditing(id); setMessage(tr('标注已保存，未修改原图。', 'Annotation saved. Source image unchanged.'))
    } catch (error) { setMessage(String(error)) } finally { setBusy(false) }
  }
  const annotations = snapshot.data.entries.filter(e => e.kind === 'annotation' && e.attachmentId === image.key)
  return <CraftDialog title={tr('地图工作台', 'Map workbench')} onClose={() => askLeave(onClose)} wide>
    {leave && <div className="craft-workbench-notice" role="alert"><p>{tr('这条标注尚未保存。放弃更改并继续？', 'This annotation has unsaved changes. Discard and continue?')}</p><button onClick={() => { const action = leave.action; setLeave(undefined); action() }}>{tr('放弃未保存更改', 'Discard changes')}</button> <button onClick={() => setLeave(undefined)}>{tr('返回保存', 'Keep editing')}</button></div>}
    <div className="craft-workbench-toolbar">
      <button disabled={index === 0 || busy} onClick={() => switchImage(index - 1)} aria-label={tr('上一张', 'Previous')}>◀</button><span>{index + 1} / {images.length}</span><button disabled={index === images.length - 1 || busy} onClick={() => switchImage(index + 1)} aria-label={tr('下一张', 'Next')}>▶</button>
      <label>{tr('缩放', 'Zoom')} <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0, 25, 50, 100, 150, 200, 400].map(n => <option key={n} value={n}>{n === 0 ? tr('适应窗口', 'Fit') : `${n}%`}</option>)}</select></label>
      <button aria-pressed={pixel} onClick={() => setPixel(!pixel)}>{tr('像素模式', 'Pixel mode')}</button>
      {prefs.imageWorkbench && <><label>{tr('视图', 'View')} <select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setTool('pan') }}><option value="single">{tr('单图', 'Single')}</option><option value="compare" disabled={images.length < 2}>{tr('左右对比', 'Side by side')}</option><option value="wipe" disabled={images.length < 2 || !sameSize}>{tr('滑杆对比（同尺寸）', 'Wipe (same size)')}</option></select></label>
      {mode !== 'single' && <label>{tr('对比图', 'Compare with')} <select value={other} onChange={e => setOther(Number(e.target.value))}>{images.map((row, i) => <option value={i} key={row.key} disabled={i === index}>{row.path.split(/[\\/]/).pop()}</option>)}</select></label>}
      <button aria-pressed={tool === 'mark'} disabled={mode !== 'single'} onClick={() => setTool(tool === 'mark' ? 'pan' : 'mark')}>{tr('框选标注', 'Mark region')}</button></>}
    </div>
    <div className="craft-image-caption"><strong title={image.path}>{image.path}</strong><small>{image.attachment.width} × {image.attachment.height} · {tr('读取时附件', 'Attachment at read time')} · #{image.seq}</small></div>
    {mode !== 'single' && !sameSize && <p className="craft-workbench-notice">{tr('两图尺寸不同，保持各自比例；平移按相对位置同步。', 'Different dimensions. Aspect ratios preserved; panning synchronizes relative positions.')}</p>}
    <div className={`craft-image-stage craft-image-stage-${mode}`}>
      <ImageCanvas key={`${image.key}:${mode}:${mode === 'wipe' ? right.key : ''}`} image={image} load={load} zoom={zoom} pixel={pixel} tool={tool} region={region} onRegion={setRegion} scroller={node => { scrollers.current[0] = node }} sync={sync} overlay={mode === 'wipe' ? right : undefined} wipe={wipe} />
      {mode === 'compare' && <ImageCanvas key={`right:${right.key}`} image={right} load={load} zoom={zoom} pixel={pixel} tool="pan" scroller={node => { scrollers.current[1] = node }} sync={sync} />}
    </div>
    {mode === 'wipe' && <label className="craft-wipe">{tr('对比位置', 'Comparison position')} <input type="range" min="0" max="100" value={wipe} onChange={e => setWipe(Number(e.target.value))} /></label>}
    {prefs.imageWorkbench && <div className="craft-annotation-controls">
      <p>{tr('在单图模式点击“框选标注”后拖出矩形。也可用下方百分比精确设置。', 'In Single view, choose Mark region and drag a rectangle, or enter percentages below.')}</p>
      <div className="craft-region-fields">{(['x', 'y', 'width', 'height'] as const).map(field => <label key={field}>{field}<input type="number" min="0" max="100" step="0.1" value={Number(((region?.[field] ?? (field === 'width' || field === 'height' ? 1 : 0)) * 100).toFixed(1))} onChange={e => {
        const next = { ...(region ?? { x: 0, y: 0, width: 1, height: 1 }), [field]: Math.max(0, Math.min(100, Number(e.target.value))) / 100 }
        next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y); setRegion(next)
      }} />%</label>)}</div>
      <textarea aria-label={tr('标注说明', 'Annotation note')} maxLength={4000} placeholder={tr('例如：这里遮挡了最新回复，请上移。', 'For example: this overlaps the latest reply; move it up.')} value={note} onChange={e => setNote(e.target.value)} />
      <div className="craft-workbench-toolbar"><button disabled={busy || snapshot.loading || !region?.width || !region?.height || !note.trim()} onClick={() => void save()}>{tr('保存标注', 'Save annotation')}</button><button disabled={!region?.width || !region?.height || !note.trim()} onClick={() => setMessage(append(feedbackText(image, region!, note)) ? tr('已加入草稿，尚未发送。', 'Added to draft. Not sent.') : tr('输入框正忙或已变化，请重试。', 'Composer busy or changed. Please retry.'))}>{tr('将反馈加入草稿', 'Add feedback to draft')}</button><button disabled={busy || !region?.width || !region?.height} onClick={() => { setBusy(true); void markedImage(image, region!, load).then(blob => { downloadImage(blob); setMessage(tr('已导出带框线的派生 PNG（最大 400 万像素），未附加到会话；说明文字请用“加入草稿”。', 'Exported a derived PNG with region overlay (up to 4 MP). Not attached; use Add feedback for the text note.')) }).catch(error => setMessage(String(error))).finally(() => setBusy(false)) }}>{tr('导出标注 PNG', 'Export marked PNG')}</button>{inspect && <button onClick={() => askLeave(() => { inspect(image); onClose() })}>{tr('读取记录', 'Read record')}</button>}</div>
      <small>{tr('仅插入来源、坐标和文字，不重新附加图片；文本模型仍无法看图。', 'Inserts references, coordinates and text only; does not reattach images or give text-only models vision.')}</small>
      {annotations.length > 0 && <div className="craft-saved-marks">{annotations.map((e, i) => <button key={e.id} onClick={() => askLeave(() => { setRegion(e.region); setNote(e.note); setEditing(e.id); setMode('single') })}>#{i + 1} {e.note.slice(0, 36)}</button>)}</div>}
    </div>}
    {(message || snapshot.error) && <p className="craft-workbench-notice" role="status">{message || snapshot.error}<button onClick={() => void bridge.load(true)}>{tr('重新载入书签册', 'Reload notebook')}</button></p>}
  </CraftDialog>
}

function ImageCanvas({ image, load, zoom, pixel, tool, region, onRegion, scroller, sync, overlay, wipe = 50 }: { image: ViewedImage, load: ImageLoader, zoom: number, pixel: boolean, tool: 'pan' | 'mark', region?: Region, onRegion?: (region: Region) => void, scroller: (node: HTMLDivElement | null) => void, sync: (node: HTMLDivElement) => void, overlay?: ViewedImage, wipe?: number }) {
  const tr = useTranslate(), state = useImage(image, load), other = useImage(overlay ?? image, load, !!overlay)
  const viewport = useRef<HTMLDivElement | null>(null), surface = useRef<HTMLDivElement>(null), [bounds, setBounds] = useState({ width: 600, height: 380 })
  const drag = useRef<{ x: number, y: number, left: number, top: number, start: { x: number, y: number } }>()
  useEffect(() => {
    const node = viewport.current!
    const observer = new ResizeObserver(() => setBounds({ width: node.clientWidth - 24, height: node.clientHeight - 24 }))
    observer.observe(node); return () => observer.disconnect()
  }, [])
  const scale = zoom ? zoom / 100 : Math.min(1, Math.max(1, bounds.width) / image.attachment.width, Math.max(1, bounds.height) / image.attachment.height)
  const point = (event: React.PointerEvent) => { const box = surface.current!.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height } }
  return <div className="craft-image-viewport" tabIndex={0} aria-label={image.path} ref={node => { viewport.current = node; scroller(node) }} onScroll={e => sync(e.currentTarget)}>
    {!state.url ? <div className="craft-image-placeholder">{state.error ? <button onClick={state.retry}>{tr('图片不可用，重试', 'Image unavailable, retry')}</button> : tr('正在载入图片…', 'Loading image…')}</div> : <div className="craft-canvas-padding"><div ref={surface} className={`craft-image-canvas craft-image-tool-${tool}`} style={{ width: image.attachment.width * scale, height: image.attachment.height * scale, imageRendering: pixel ? 'pixelated' : 'auto' }}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, left: viewport.current!.scrollLeft, top: viewport.current!.scrollTop, start: point(event) }; if (tool === 'mark') onRegion?.(normalizedRegion(point(event), point(event))) }}
      onPointerMove={event => { const start = drag.current; if (!start) return; if (tool === 'mark') onRegion?.(normalizedRegion(start.start, point(event))); else { viewport.current!.scrollLeft = start.left - (event.clientX - start.x); viewport.current!.scrollTop = start.top - (event.clientY - start.y) } }}
      onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }}>
      <img src={state.url} alt={image.path} draggable={false} onError={state.failed} />
      {overlay && other.url && <img className="craft-wipe-image" src={other.url} alt={overlay.path} draggable={false} onError={other.failed} style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }} />}
      {overlay && <span className="craft-wipe-divider" style={{ left: `${wipe}%` }} />}
      {tool === 'mark' || region ? region && <div className="craft-image-region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}><span>1</span></div> : null}
    </div></div>}
    {overlay && other.error && <p role="alert">{tr('对比图载入失败', 'Comparison image unavailable')} <button onClick={other.retry}>{tr('重试', 'Retry')}</button></p>}
  </div>
}

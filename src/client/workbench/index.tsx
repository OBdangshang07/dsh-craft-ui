import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { collectImages, imagesFromCall, textContent } from '../../workbench.ts'
import { getPreferences, subscribePreferences, usePreferences } from '../store.ts'
import { ItemIcon } from '../components/ItemIcon.tsx'
import { NotebookBridge, appendFeedback } from './bridge.ts'
import { ImageGallery } from './images.tsx'
import { messageSources, NotebookPanel, type MessageSource } from './notebook.tsx'
import { useTranslate } from './ui.tsx'

const EMPTY: readonly any[] = []
const emptySource = { subscribe: () => () => {}, getSnapshot: () => EMPTY }

/** Public slots only: no DOM transcript parsing or replacement of Chat grouping. */
export function installWorkbench(ctx: any, connection: any, uiConversation: any) {
  const bridges = new Map<string, NotebookBridge>()
  const bridgeFor = (sessionId: string) => {
    let bridge = bridges.get(sessionId)
    if (!bridge) { bridge = new NotebookBridge(connection, sessionId); bridges.set(sessionId, bridge) }
    return bridge
  }
  function useAppend(props: any) {
    const input = props.useInput((s: any) => s)
    const current = useRef(input); current.current = input
    return useCallback((text: string) => appendFeedback(props.inputActions, current.current, text), [props.inputActions])
  }
  function ReadImageRow(props: any) {
    const tr = useTranslate(), append = useAppend(props)
    const images = useMemo(() => imagesFromCall(props.block), [props.block])
    const settled = props.block.kind === 'tool-result'
    return <div className="craft-read-image-row" data-craft-call={props.callId}>
      {images.length ? <ImageGallery images={images} load={props.loadImage} bridge={bridgeFor(props.sessionId)} append={append} inspect={props.inspect ? () => props.inspect() : undefined} /> : <div className="craft-image-read-status"><ItemIcon item="map" size={20} />{!settled ? tr('正在读取图片…', 'Reading image…') : props.block.isError ? tr('图片读取失败', 'Image read failed') : tr('没有可预览的图片结果', 'No previewable image result')}</div>}
      {settled && <details className="craft-image-result"><summary>{tr('工具结果 / 读取记录', 'Tool result / Read record')}</summary><pre>{textContent(props.block.content) || JSON.stringify(props.block.content, null, 2)}</pre>{props.inspect && <button onClick={props.inspect}>{tr('在轨迹中查看', 'Inspect in trajectory')}</button>}</details>}
    </div>
  }
  function TurnImages(props: any) {
    const prefs = usePreferences(), append = useAppend(props)
    const nodes = props.useChat((snapshot: any) => snapshot.nodes)
    const source = useMemo(() => nodes?.turnDataSource?.(props.turn.turn, 'tool-call') ?? emptySource, [nodes, props.turn.turn])
    const rows = useSyncExternalStore(source.subscribe, source.getSnapshot)
    const images = useMemo(() => collectImages((rows as any[]).map(row => row.root)), [rows])
    const load = useCallback((ref: any) => uiConversation.imageUrl(props.sessionId, ref), [props.sessionId])
    if (!prefs.enabled || !prefs.imageJournal || images.length === 0) return null
    return <ImageGallery images={images} load={load} bridge={bridgeFor(props.sessionId)} append={append} />
  }
  function BookContents({ parent, initial, onClose }: { parent: any, initial?: MessageSource, onClose: () => void }) {
    const nodes = parent.useChat((snapshot: any) => snapshot.legacy.nodes)
    const append = useAppend(parent)
    return <NotebookPanel key={parent.sessionId} bridge={bridgeFor(parent.sessionId)} nodes={nodes} initial={initial} append={append} onClose={onClose} />
  }
  function BookButton(props: any) {
    const tr = useTranslate(), prefs = usePreferences()
    const [open, setOpen] = useState(false)
    useEffect(() => { setOpen(false) }, [props.sessionId])
    if (!prefs.enabled || !prefs.bookmarks) return null
    return <><button className="craft-book-button" title={tr('书与羽毛笔 · 会话书签', 'Book & quill · Session notebook')} aria-label={tr('打开会话书签', 'Open session notebook')} onClick={() => setOpen(!open)}><ItemIcon item="book" size={22} /></button>{open && <BookContents parent={props} onClose={() => setOpen(false)} />}</>
  }
  function BookmarkAction(props: any) {
    const tr = useTranslate(), prefs = usePreferences(), [open, setOpen] = useState(false)
    const source = props.useChat((snapshot: any) => snapshot.legacy.nodes.find((node: any) => node.kind === 'assistant' && node.messageId === props.messageId))
    if (!prefs.enabled || !prefs.bookmarks || !source) return null
    const initial = messageSources([source])[0]
    if (!initial) return null
    return <><button className="craft-bookmark-action" title={tr('收藏回复', 'Bookmark reply')} aria-label={tr('收藏回复', 'Bookmark reply')} onClick={() => setOpen(true)}><ItemIcon item="book" size={16} /></button>{open && <BookContents parent={props} initial={initial} onClose={() => setOpen(false)} />}</>
  }
  const slots = ctx.slots
  ctx.effect(() => {
    let remove: (() => void) | undefined
    const update = () => {
      const prefs = getPreferences(), enabled = prefs.enabled && prefs.imageJournal
      if (enabled && !remove) remove = slots.inject('tool.call.toolview', () => slots.register({ name: 'tool.call.toolview', key: 'read_image', priority: -100 }, ReadImageRow))
      else if (!enabled && remove) { remove(); remove = undefined }
    }
    update()
    const unsubscribe = subscribePreferences(update)
    return () => { unsubscribe(); remove?.() }
  }, 'craft-ui: optional read-image view')
  for (const [slot, id, component] of [
    ['conversation.chat.turnTail', 'craft-image-journal', TurnImages],
    ['conversation.session.header.actions', 'craft-notebook', BookButton],
    ['conversation.chat.assistant-actions', 'craft-bookmark', BookmarkAction],
  ] as const) ctx.effect(() => slots.inject(slot, () => slots.register({ name: slot, id, order: 40 }, component)), `craft-ui: ${id}`)
  ctx.effect(() => () => { bridges.forEach(bridge => bridge.dispose()); bridges.clear() }, 'craft-ui: notebook lifetime')
}

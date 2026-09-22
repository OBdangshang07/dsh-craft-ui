import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NineSlice } from './NineSlice.tsx'
import { ItemIcon } from './ItemIcon.tsx'
import { setPreferences, usePreferences } from '../store.ts'
import type { CraftPreferences } from '../types.ts'
import type { ResourcePackBridge, ResourcePackStatus } from '../resource.ts'

type OptionsPage = 'options' | 'gameplay' | 'assets'

export function CraftPanel({ onClose, resource }: { onClose: () => void, resource?: ResourcePackBridge }) {
  const prefs = usePreferences()
  const [page, setPage] = useState<OptionsPage>('options')
  const [archivePath, setArchivePath] = useState('')
  const [resourceStatus, setResourceStatus] = useState<ResourcePackStatus>()
  const [resourceMessage, setResourceMessage] = useState('')
  const [resourceBusy, setResourceBusy] = useState(false)
  useEffect(() => {
    if (!resource) return
    let active = true
    void resource.status().then(status => { if (active) setResourceStatus(status) }).catch(error => {
      if (active) setResourceMessage(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [resource])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        page === 'options' ? onClose() : setPage('options')
        return
      }
      if (event.key !== 'Tab') return
      const controls = [...document.querySelectorAll<HTMLElement>('.craft-control-panel button:not(:disabled),.craft-control-panel input:not(:disabled)')]
      if (controls.length === 0) return
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) {
        event.preventDefault()
        controls.at(-1)?.focus()
      } else if (!event.shiftKey && index === controls.length - 1) {
        event.preventDefault()
        controls[0]?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, page])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.craft-control-panel button:not(:disabled),.craft-control-panel input:not(:disabled)')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [page])

  const runResource = async (operation: () => Promise<ResourcePackStatus>, success: string) => {
    setResourceBusy(true)
    setResourceMessage('')
    try {
      const status = await operation()
      setResourceStatus(status)
      setResourceMessage(success)
    } catch (error) {
      setResourceMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setResourceBusy(false)
    }
  }
  const back = () => page === 'options' ? onClose() : setPage('options')
  return createPortal(<div className="craft-panel-shade" role="presentation">
    <NineSlice kind="panel" className={`craft-control-panel craft-options-${page}`} role="dialog" aria-modal="true" aria-label="Craft UI settings">
      <header><h2>{page === 'options' ? '选项' : page === 'gameplay' ? 'HUD 与玩法设置' : '素材与资源包'}</h2></header>
      <section>
        {page === 'options' && <OptionsHome prefs={prefs} open={setPage} resourceStatus={resourceStatus} />}
        {page === 'gameplay' && <GameplayOptions prefs={prefs} />}
        {page === 'assets' && <AssetsOptions resource={resource} resourceStatus={resourceStatus} archivePath={archivePath} setArchivePath={setArchivePath} resourceBusy={resourceBusy} resourceMessage={resourceMessage} runResource={runResource} />}
      </section>
      <footer>
        <button className="craft-done" onClick={back}>{page === 'options' ? '完成' : '返回'}</button>
      </footer>
    </NineSlice>
  </div>, document.body)
}

function OptionsHome({ prefs, open, resourceStatus }: { prefs: CraftPreferences, open: (page: OptionsPage) => void, resourceStatus?: ResourcePackStatus }) {
  return <div className="craft-options-grid">
    <ToggleOption autoFocus label="Craft UI" value={prefs.enabled} onChange={enabled => setPreferences({ enabled })} />
    <CycleOption label="世界主题" value={prefs.theme === 'craft-day' ? '主世界日间' : '深板岩夜间'} onClick={() => setPreferences({ theme: prefs.theme === 'craft-day' ? 'craft-deepslate' : 'craft-day' })} />
    <CycleOption label="界面尺寸" value={prefs.scale === 1 ? '紧凑' : prefs.scale === 2 ? '标准' : '大号'} onClick={() => setPreferences({ scale: (prefs.scale === 3 ? 1 : prefs.scale + 1) as 1 | 2 | 3 })} />
    <CycleOption label="动效等级" value={prefs.motion === 'full' ? '完整' : prefs.motion === 'reduced' ? '精简' : '关闭'} onClick={() => setPreferences({ motion: nextMotion(prefs.motion) })} />
    <button className="craft-menu-link" onClick={() => open('gameplay')}>HUD 与玩法设置…</button>
    <button className="craft-menu-link" onClick={() => open('assets')}>素材与资源包…</button>
    <p className="craft-options-note">界面尺寸会同步缩放 HUD。系统的“减少动态效果”设置始终优先。</p>
    <p className="craft-options-note">{resourceStatus?.capabilities.items ? `已启用 ${resourceStatus.files} 个本地物品贴图` : '当前使用原创 Pixel UI Kit'}</p>
  </div>
}

function GameplayOptions({ prefs }: { prefs: CraftPreferences }) {
  return <div className="craft-options-grid craft-gameplay-grid">
    <ToggleOption autoFocus label="环境氛围" value={prefs.atmosphere} onChange={atmosphere => setPreferences({ atmosphere })} />
    <ToggleOption label="Context 经验条" value={prefs.xpBar} onChange={xpBar => setPreferences({ xpBar })} />
    <ToggleOption label="状态物品栏" value={prefs.hotbar} onChange={hotbar => setPreferences({ hotbar })} />
    <ToggleOption label="模型装备与附魔" value={prefs.equipment} onChange={equipment => setPreferences({ equipment })} />
    <ToggleOption label="任务书" value={prefs.questBook} onChange={questBook => setPreferences({ questBook })} />
    <ToggleOption label="伙伴列表" value={prefs.agentList} onChange={agentList => setPreferences({ agentList })} />
    <ToggleOption label="Advancement 通知" value={prefs.advancements} onChange={advancements => setPreferences({ advancements })} />
    <ToggleOption label="界面音效" value={prefs.sounds} onChange={sounds => setPreferences({ sounds })} />
    <div className="craft-option-spacer" />
    <p className="craft-options-note craft-options-note-wide">状态均来自 Harness 原生会话：Context、模型、工具、Todos、Plan、Goal 与 Subagents，不在客户端虚构进度。</p>
  </div>
}

function AssetsOptions({ resource, resourceStatus, archivePath, setArchivePath, resourceBusy, resourceMessage, runResource }: {
  resource?: ResourcePackBridge
  resourceStatus?: ResourcePackStatus
  archivePath: string
  setArchivePath: (value: string) => void
  resourceBusy: boolean
  resourceMessage: string
  runResource: (operation: () => Promise<ResourcePackStatus>, success: string) => Promise<void>
}) {
  return <div className="craft-resource-screen">
    <p className="craft-resource-help">选择本机 Java 版资源目录。只读取白名单物品贴图，按钮、槽位和背景仍使用插件原创 UI。</p>
    <div className="craft-pack-columns">
      <div className="craft-pack-column"><h3>基础资源</h3><div className="craft-pack-entry muted"><ItemIcon item="book" size={32} /><span><b>原创 Pixel UI Kit</b><small>按钮、槽位与背景 · 固定启用</small></span></div></div>
      <div className="craft-pack-column"><h3>物品覆盖</h3><div className="craft-pack-entry selected"><ItemIcon item="hopper" size={32} /><span><b>{resourceStatus?.active ? '本地物品覆盖' : '未选择本地物品'}</b><small>{resourceStatus?.active ? `${resourceStatus.sourceName} · ${resourceStatus.files} 个物品 · ${formatBytes(resourceStatus.bytes)}` : '使用原创语义图标'}</small></span></div></div>
    </div>
    {resourceStatus?.active && <div className="craft-capabilities" aria-label="可用资源能力">{capabilityLabels(resourceStatus).map(row => <span key={row}>{row}</span>)}</div>}
    <label className="craft-path-label"><span>资源包 textures 或 items 的绝对路径</span><input autoFocus value={archivePath} onChange={event => setArchivePath(event.target.value)} placeholder="C:\\path\\to\\resource-pack\\textures" disabled={resourceBusy || !resource?.isLoopback} /></label>
    <div className="craft-resource-actions"><button disabled={resourceBusy || !archivePath.trim() || !resource?.isLoopback} onClick={() => void runResource(() => resource!.importItemDirectory(archivePath), '物品贴图导入成功')}>{resourceBusy ? '处理中…' : '导入此资源包'}</button><button className="craft-secondary" disabled={resourceBusy || !resourceStatus?.active} onClick={() => void runResource(() => resource!.clear(), '已恢复原创素材')}>恢复默认资源包</button></div>
    {!resource?.isLoopback && <p className="craft-error">资源导入只允许在 Harness 本机页面执行。</p>}
    {resourceMessage && <p className={resourceMessage.includes('成功') || resourceMessage.includes('恢复') ? 'craft-success' : 'craft-error'} role="status">{resourceMessage}</p>}
  </div>
}

function ToggleOption({ label, value, onChange, autoFocus = false }: { label: string, value: boolean, onChange: (value: boolean) => void, autoFocus?: boolean }) {
  return <button autoFocus={autoFocus} className="craft-option-button" aria-pressed={value} onClick={() => onChange(!value)}><span>{label}:</span> <b className={value ? 'on' : 'off'}>{value ? '开' : '关'}</b></button>
}

function CycleOption({ label, value, onClick }: { label: string, value: string, onClick: () => void }) {
  return <button className="craft-option-button" onClick={onClick}><span>{label}:</span> <b>{value}</b></button>
}

function nextMotion(value: CraftPreferences['motion']): CraftPreferences['motion'] {
  return value === 'full' ? 'reduced' : value === 'reduced' ? 'off' : 'full'
}

function capabilityLabels(status: ResourcePackStatus): string[] {
  const labels: Array<[keyof ResourcePackStatus['capabilities'], string]> = [
    ['items', '原版物品'], ['modernSprites', '现代 GUI'], ['legacyWidgets', '经典 widgets'], ['containers', '容器'], ['fonts', '字体定义'], ['sounds', 'UI 音频'],
  ]
  const active = labels.filter(([key]) => status.capabilities[key]).map(([, label]) => label)
  return active.length > 0 ? active : ['未识别语义贴图']
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

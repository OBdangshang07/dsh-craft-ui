/** Adapter-owned vocabulary; never invent a universal list of effort levels. */
export interface ModelSelection { provider: string, model: string, reasoningEffort?: string }
export interface ModelChoice { id: string, name: string, description?: string, reasoning?: { efforts: readonly { id: string, name: string }[], defaultEffort?: string } }
export interface ModelState {
  current: ModelSelection | null
  groups: readonly { id: string, name: string, models: readonly ModelChoice[] }[]
  failures: readonly { id: string, name: string, message: string }[]
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  error: string | null
  routable: boolean | null
}
export function reasoningView(state: ModelState) {
  const model = state.groups.find(g => g.id === state.current?.provider)?.models.find(m => m.id === state.current?.model)
  const metadata = model?.reasoning
  const levels: { id: string | undefined, name: string }[] = metadata ? [
    ...(metadata.defaultEffort === undefined ? [{ id: undefined, name: 'Default' }] : []),
    ...metadata.efforts,
  ] : []
  const effective = state.current?.reasoningEffort ?? metadata?.defaultEffort
  const index = levels.findIndex(level => level.id === effective)
  // Include the current effort as well as the catalog: another entry changing
  // either during a gesture invalidates that gesture instead of undoing it.
  const identity = JSON.stringify([state.current, levels.map(level => level.id), metadata?.defaultEffort])
  return { model, levels, effective, index, identity, label: index < 0 ? effective ?? '' : levels[index].name }
}
export function effortSelection(state: ModelState, identity: string, index: number): ModelSelection | undefined {
  const view = reasoningView(state)
  if (!state.current || state.status === 'loading' || state.status === 'selecting' || identity !== view.identity || !Number.isInteger(index) || index < 0 || index >= view.levels.length) return
  return { provider: state.current.provider, model: state.current.model, ...(view.levels[index].id === undefined ? {} : { reasoningEffort: view.levels[index].id }) }
}
export function defaultSelection(provider: string, model: ModelChoice): ModelSelection {
  return { provider, model: model.id, ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }) }
}

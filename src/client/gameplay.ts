export interface ToolView { callId: string, name: string }
export interface TodoView { content: string, status: 'pending' | 'in_progress' | 'completed' }
export interface AgentView { id: string, label: string, running: boolean, mode?: string }
export interface GoalView { objective: string, phase: string, roundsStarted: number, maxGoalRounds: number }

export interface GameplayView {
  context: { ratio: number, used?: number, capacity?: number }
  model?: string
  provider?: string
  reasoning?: string
  tools: ToolView[]
  todos: TodoView[]
  planActive: boolean
  goal?: GoalView
  agents: AgentView[]
  running: boolean
  pending: number
}

type Summary = { id: string, displayTitle?: string, running?: boolean, retainedBy?: Readonly<Record<string, number>>, projectionValues?: Record<string, unknown> }
export type SessionListLike = { current?: string, byId: Record<string, Summary>, subagentsByParent?: Record<string, { entries?: unknown[] }> }
export type SessionStatusLike = { running?: boolean, pendingInteraction?: unknown }
export type ConversationLike = { running?: boolean, runningCalls?: Array<{ callId?: string, name?: string }>, pending?: unknown[], nodes?: unknown[] }

/** 0.1.7 identifies the visible Session by its mainView reference owner. */
export function normalizeSessionList(list: SessionListLike): SessionListLike {
  const rows = Object.values(list.byId)
  // A modern catalog with no mainView means the empty screen, not the last row.
  const modern = rows.some(row => row.retainedBy !== undefined)
  const current = modern ? rows.find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id : list.current
  return { ...list, current }
}

/** Normalize the split Session + Chat contracts introduced in DSH 0.1.5. */
export function normalizeConversation(
  session: { running?: boolean },
  chat: { legacy?: { runningCalls?: readonly { callId?: string, name?: string }[], nodes?: readonly unknown[] } },
  hasPendingInteraction: boolean,
): ConversationLike {
  return {
    running: session.running,
    runningCalls: chat.legacy?.runningCalls ? [...chat.legacy.runningCalls] : [],
    pending: hasPendingInteraction ? [{}] : [],
    nodes: chat.legacy?.nodes ? [...chat.legacy.nodes] : [],
  }
}

export function projectGameplay(list: SessionListLike, conversation?: ConversationLike, statuses?: ReadonlyMap<string, SessionStatusLike>): GameplayView {
  const current = list.current
  const summary = current ? list.byId[current] : undefined
  const projections = summary?.projectionValues ?? {}
  const pressure = asRecord(projections.contextPressure)
  const used = numberOf(pressure?.projectedTokens) ?? numberOf(pressure?.pressureTokens)
  const capacity = numberOf(pressure?.contextWindow)
  const ratio = used !== undefined && capacity !== undefined && capacity > 0 ? clamp(used / capacity) : 0
  const assistant = latestAssistant(conversation?.nodes)
  const request = asRecord(assistant?.requestConfig)
  const provenance = asRecord(assistant?.providerMetadata) ?? asRecord(assistant?.provenance)
  const model = stringOf(request?.model) ?? stringOf(provenance?.model)
  const provider = stringOf(request?.provider) ?? stringOf(provenance?.provider)
  const reasoning = stringOf(request?.reasoningEffort) ?? stringOf(request?.thinking)
  const todos = Array.isArray(projections.todos)
    ? projections.todos.filter(isTodo).map(item => ({ content: item.content, status: item.status }))
    : []
  const plan = asRecord(projections.plan)
  const goalProjection = asRecord(projections.goal)
  const goal = asRecord(goalProjection?.goal)
  const catalog = current ? list.subagentsByParent?.[current] : undefined
  const modernCatalog = Array.isArray(projections.subagentCatalog) ? projections.subagentCatalog : undefined
  const agents = (modernCatalog ?? catalog?.entries ?? []).flatMap((entry): AgentView[] => {
    const row = asRecord(entry)
    if (!row || (!modernCatalog && row.kind !== 'child') || typeof row.id !== 'string') return []
    const child = list.byId[row.id]
    const running = statuses?.get(row.id)?.running ?? child?.running ?? (row.activity === 'running')
    return [{ id: row.id, label: stringOf(row.label) ?? child?.displayTitle ?? row.id.slice(0, 8), running, mode: stringOf(row.mode) }]
  })
  return {
    context: { ratio, used, capacity }, model, provider, reasoning,
    tools: (conversation?.runningCalls ?? []).map((call, index) => ({ callId: call.callId ?? `tool-${index}`, name: call.name ?? 'tool' })),
    todos,
    planActive: Boolean(plan && (plan.pending ? !plan.active : plan.active)),
    goal: goal && typeof goal.objective === 'string' && typeof goal.phase === 'string'
      ? { objective: goal.objective, phase: goal.phase, roundsStarted: numberOf(goalProjection?.roundsStarted) ?? 0, maxGoalRounds: numberOf(goal.maxGoalRounds) ?? 0 }
      : undefined,
    agents,
    running: conversation?.running ?? summary?.running ?? false,
    pending: conversation?.pending?.length ?? 0,
  }
}

function latestAssistant(nodes: unknown[] | undefined): Record<string, unknown> | undefined {
  if (!nodes) return undefined
  for (let index = nodes.length - 1; index >= 0; index -= 1) { const row = asRecord(nodes[index]); if (row?.kind === 'assistant') return row }
  return undefined
}
function isTodo(value: unknown): value is TodoView { const row = asRecord(value); return typeof row?.content === 'string' && (row.status === 'pending' || row.status === 'in_progress' || row.status === 'completed') }
function asRecord(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined }
function numberOf(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function stringOf(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)) }

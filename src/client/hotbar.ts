import type { ItemSemantic } from './components/ItemIcon.tsx'
import type { GameplayView } from './gameplay.ts'

export type HotbarSlot = { item: ItemSemantic, label: string, title: string, count?: number, active?: boolean }

export function makeHotbarSlots(view: GameplayView): Array<HotbarSlot | undefined> {
  const slots: Array<HotbarSlot | undefined> = Array(9)
  view.tools.slice(0, 4).forEach((tool, index) => { slots[index] = { item: toolItem(tool.name), label: shortTool(tool.name), title: tool.name, active: true } })
  if (view.model) slots[4] = { item: 'star', label: 'MODEL', title: `${view.provider ?? 'Model'} · ${view.model}` }
  if (view.goal) slots[5] = { item: 'totem', label: 'GOAL', title: view.goal.objective, active: view.goal.phase === 'active' }
  if (view.todos.length > 0) slots[6] = { item: 'book', label: 'QUESTS', title: `${view.todos.length} quests`, count: view.todos.length }
  if (view.agents.length > 0) slots[7] = { item: 'agent', label: 'AGENTS', title: `${view.agents.length} companions`, count: view.agents.length, active: view.agents.some(agent => agent.running) }
  if (view.pending > 0) slots[8] = { item: 'redstone', label: 'APPROVE', title: `${view.pending} pending interactions`, count: view.pending, active: true }
  return slots
}

export function toolItem(name: string): ItemSemantic {
  const value = name.toLowerCase()
  if (/write_stdin|shell|exec|terminal|command/.test(value)) return 'pickaxe'
  if (/search|find|browse|web|fetch|read/.test(value)) return value.includes('web') || value.includes('browse') ? 'eye' : 'compass'
  if (/write|edit|patch|replace|format/.test(value)) return 'axe'
  if (/image|photo|vision|screenshot/.test(value)) return 'map'
  if (/agent|thread|task/.test(value)) return 'agent'
  if (/goal/.test(value)) return 'totem'
  if (/plan|todo/.test(value)) return 'book'
  if (/request|question|input|message|mail|notify/.test(value)) return 'paper'
  return 'command'
}

export function shortTool(name: string): string {
  return name.replace(/^.*[./]/, '').replaceAll('_', ' ').slice(0, 9).toUpperCase()
}

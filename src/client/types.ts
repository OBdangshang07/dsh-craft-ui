export type CraftThemeId = 'craft-day' | 'craft-deepslate'
export type MotionLevel = 'full' | 'reduced' | 'off'

export interface CraftPreferences {
  enabled: boolean
  theme: CraftThemeId
  scale: 1 | 2 | 3
  motion: MotionLevel
  atmosphere: boolean
  advancements: boolean
  sounds: boolean
  xpBar: boolean
  hotbar: boolean
  equipment: boolean
  questBook: boolean
  agentList: boolean
  imageJournal: boolean
  imageWorkbench: boolean
  bookmarks: boolean
  reasoningControl: 'slider' | 'menu'
}

export const DEFAULT_PREFERENCES: CraftPreferences = {
  enabled: true,
  theme: 'craft-deepslate',
  scale: 2,
  motion: 'full',
  atmosphere: true,
  advancements: true,
  sounds: false,
  xpBar: true,
  hotbar: true,
  equipment: true,
  questBook: true,
  agentList: true,
  imageJournal: true,
  imageWorkbench: true,
  bookmarks: true,
  reasoningControl: 'slider',
}

import type { CSSProperties, HTMLAttributes } from 'react'
import { Sprite, type SpriteName } from './Sprite.tsx'

export type ItemSemantic = 'pickaxe' | 'axe' | 'sword' | 'book' | 'compass' | 'emerald' | 'redstone' | 'helmet' | 'star' | 'eye' | 'paper' | 'clock' | 'xp' | 'agent' | 'totem' | 'map' | 'hopper' | 'command'

const FALLBACK: Record<ItemSemantic, SpriteName> = {
  pickaxe: 'pickaxe', axe: 'pickaxe', sword: 'sword', book: 'book', compass: 'compass',
  emerald: 'emerald', redstone: 'redstone', helmet: 'helmet', star: 'emerald', eye: 'compass',
  paper: 'book', clock: 'compass', xp: 'emerald', agent: 'helmet', totem: 'emerald', map: 'book',
  hopper: 'chest', command: 'crafting',
}

export interface ItemIconProps extends HTMLAttributes<HTMLSpanElement> {
  item: ItemSemantic
  size?: number
}

export function ItemIcon({ item, size = 32, className = '', style, ...props }: ItemIconProps) {
  const merged = {
    width: size,
    height: size,
    '--craft-item-image': `var(--craft-item-${item})`,
    '--craft-item-available': `var(--craft-item-available-${item}, 0)`,
    ...style,
  } as CSSProperties
  return <span {...props} className={`craft-item-icon ${className}`} style={merged} role="img" aria-label={item}>
    <i aria-hidden="true" />
    <Sprite name={FALLBACK[item]} size={size} className="craft-item-fallback" aria-hidden="true" />
  </span>
}

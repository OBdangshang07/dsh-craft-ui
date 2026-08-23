import type { CSSProperties, HTMLAttributes } from 'react'

export type SpriteName = 'pickaxe' | 'book' | 'sword' | 'compass' | 'chest' | 'emerald' | 'redstone' | 'helmet' | 'crafting'

const INDEX: Record<SpriteName, number> = {
  pickaxe: 0,
  book: 1,
  sword: 2,
  compass: 3,
  chest: 4,
  emerald: 5,
  redstone: 6,
  helmet: 7,
  crafting: 8,
}

export interface SpriteProps extends HTMLAttributes<HTMLSpanElement> {
  name: SpriteName
  size?: number
}

export function Sprite({ name, size = 32, className = '', style, ...props }: SpriteProps) {
  const scale = size / 16
  const merged: CSSProperties = {
    width: size,
    height: size,
    backgroundPosition: `${-INDEX[name] * 16 * scale}px 0`,
    backgroundSize: `${144 * scale}px ${16 * scale}px`,
    ...style,
  }
  return <span {...props} role="img" aria-label={name} className={`craft-sprite ${className}`} style={merged} />
}

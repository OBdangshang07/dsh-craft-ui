import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export type NineSliceKind = 'panel' | 'button' | 'button-hover' | 'button-pressed' | 'tooltip'

export interface NineSliceProps extends HTMLAttributes<HTMLDivElement> {
  kind: NineSliceKind
  children?: ReactNode
}

export function NineSlice({ kind, children, className = '', style, ...props }: NineSliceProps) {
  const merged = {
    '--craft-slice-image': `var(--craft-${kind})`,
    ...style,
  } as CSSProperties
  return <div {...props} className={`craft-nine-slice ${className}`} data-slice={kind} style={merged}>{children}</div>
}

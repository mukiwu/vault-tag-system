import type { NodeStyle } from './palette'
import { WARN } from './palette'

/** 矩陣、狀態列、圖例共用的結點，三處長得一樣才讀得通 */
export function Node({ node, className }: { node: NodeStyle; className?: string }) {
  return (
    <span
      className={className}
      style={{
        width: node.size,
        height: node.size,
        borderRadius: node.radius,
        background: node.fill,
        border: node.border,
        boxShadow: node.ring,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {node.cross && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke={WARN} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

import { useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { histogram } from '../core/histogram'
import { useStore } from '../store'

const BINS = 120
const HEIGHT = 74
const GAP = 0.01

type Which = 'auto' | 'review'

/**
 * 判定值的分布，門檻直接畫在上面。
 *
 * 門檻設多少一直是憑感覺的事，看得到分布就不必猜：拖動把手是純前端重算，
 * 不會重打 API。
 */
export function Histogram() {
  const grid = useStore((s) => s.grid)
  const thresholds = useStore((s) => s.thresholds)
  const setThresholds = useStore((s) => s.setThresholds)
  const statsRevision = useStore((s) => s.statsRevision)

  const barsRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<Which | null>(null)

  const bins = useMemo(
    () => (grid ? histogram(grid, BINS) : new Array<number>(BINS).fill(0)),
    // grid 就地更新，statsRevision 變了才需要重算
    [grid, statsRevision],
  )

  const judged = bins.some((count) => count > 0)
  const max = Math.max(...bins, 1)

  /**
   * 一律從 store 讀當下的門檻。
   * 按住方向鍵會連續觸發，若拿渲染時捕獲的值去算增量，整串按鍵都會基於同一個
   * 舊值，結果只前進一步。
   */
  const apply = (which: Which, value: number) => {
    const current = useStore.getState().thresholds
    if (which === 'auto') setThresholds({ auto: Math.max(value, current.review + GAP) })
    else setThresholds({ review: Math.min(value, current.auto - GAP) })
  }

  const valueAt = (clientX: number) => {
    const rect = barsRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const startDrag = (which: Which) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    dragging.current = which
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    apply(dragging.current, valueAt(event.clientX))
  }

  const endDrag = () => {
    dragging.current = null
  }

  const onKey = (which: Which) => (event: ReactKeyboardEvent) => {
    const step = event.key === 'PageUp' || event.key === 'PageDown' ? 0.1 : 0.01
    const dir =
      event.key === 'ArrowRight' || event.key === 'PageUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'PageDown'
          ? -1
          : 0
    if (dir === 0) return
    event.preventDefault()
    const current = useStore.getState().thresholds[which]
    apply(which, Math.min(1, Math.max(0, current + dir * step)))
  }

  const handle = (which: Which, value: number, color: string, label: string) => (
    <button
      key={which}
      className="handle"
      style={{ left: `${value * 100}%` }}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))}
      onPointerDown={startDrag(which)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKey(which)}
    >
      <span className="line" style={{ background: color }} />
      <span className="grip" style={{ background: color }} />
    </button>
  )

  return (
    <div className="histogram">
      <div className="head">
        <span className="muted">信心分布</span>
        <span className="hint">
          {judged ? '拖動把手切門檻，不必重跑判定' : '跑過判定之後這裡會出現分布'}
        </span>
        <div className="spacer" />
        <span className="mono" style={{ color: 'var(--review)' }}>
          審核 {thresholds.review.toFixed(2)}
        </span>
        <span className="mono" style={{ color: 'var(--auto)' }}>
          自動 {thresholds.auto.toFixed(2)}
        </span>
      </div>

      <div className="bars" ref={barsRef}>
        {judged &&
          bins.map((count, index) => {
            const t = index / (BINS - 1)
            // 分布極度右偏，用對數高度才看得到尾巴那一小撮
            const height =
              count === 0 ? 0 : Math.max(2, (Math.log10(count + 1) / Math.log10(max + 1)) * HEIGHT)
            // bar 的顏色跟著門檻走，一眼看出門檻把資料切成哪三塊
            const band =
              t >= thresholds.auto
                ? 'var(--auto)'
                : t >= thresholds.review
                  ? 'var(--review)'
                  : 'var(--none)'
            return (
              <span key={index} className="bar" style={{ height: `${height}px`, background: band }} />
            )
          })}
        {handle('review', thresholds.review, 'var(--review)', '審核門檻')}
        {handle('auto', thresholds.auto, 'var(--auto)', '自動採納門檻')}
      </div>

      <div className="axis">
        <span>0.0</span>
        <span>0.2</span>
        <span>0.4</span>
        <span>0.6</span>
        <span>0.8</span>
        <span>1.0</span>
      </div>
    </div>
  )
}

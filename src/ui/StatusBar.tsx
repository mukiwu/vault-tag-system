import { cellAt } from '../core/grid'
import { useStore } from '../store'
import { describeCell } from './describe'
import { Node } from './Node'
import { nodeStyle } from './palette'

/**
 * 矩陣底下的狀態列，回答三件事：這格現在是什麼、寫入時會怎樣、點下去會變成什麼。
 * 點完之後內容馬上跟著變，結點形狀的變化才看得懂。
 */
export function StatusBar() {
  const grid = useStore((s) => s.grid)
  const thresholds = useStore((s) => s.thresholds)
  const hovered = useStore((s) => s.hovered)
  // grid 就地更新，點完要靠 revision 重讀這一格
  useStore((s) => s.revision)

  const inRange =
    grid && hovered && hovered.row < grid.notes.length && hovered.column < grid.tags.length

  if (!grid || !hovered || !inRange) {
    return (
      <div className="status-bar" aria-live="polite">
        <span className="muted">把游標移到格子上，這裡會顯示它的狀態、寫入時的結果，以及點下去會變成什麼</span>
      </div>
    )
  }

  const cell = cellAt(grid, hovered.row, hovered.column)
  const node = nodeStyle(cell, thresholds)
  const reading = describeCell(cell, thresholds)

  return (
    <div className="status-bar" aria-live="polite">
      <span className="swatch">
        <Node node={node} />
      </span>
      <span className="where">
        {grid.notes[hovered.row].title} · {grid.tags[hovered.column]}
      </span>
      <span>
        <span className="muted">目前 </span>
        <span className="value">{reading.label}</span>
        <span className="mono muted"> {reading.score}</span>
      </span>
      <span>
        <span className="muted">寫入時 </span>
        <span className="value">{reading.outcome}</span>
      </span>
      <span className="spacer" />
      <span className="next">
        <span className="muted">點一下 → </span>
        {reading.next}
      </span>
    </div>
  )
}

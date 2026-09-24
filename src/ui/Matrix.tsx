import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { status } from '../core/decision'
import { cellAt } from '../core/grid'
import { useStore } from '../store'
import { describeCell } from './describe'
import { Node } from './Node'
import { nodeStyle } from './palette'

/** 這些數字要和 index.css 的 --cell-w 等變數對得上 */
const CELL_W = 25
const CELL_H = 22
const ROW_HEADER = 190
const COL_HEADER = 84

export function Matrix() {
  const grid = useStore((s) => s.grid)
  const thresholds = useStore((s) => s.thresholds)
  const toggle = useStore((s) => s.toggle)
  const decideColumn = useStore((s) => s.decideColumn)
  const setHovered = useStore((s) => s.setHovered)
  // grid 是就地更新的，靠 revision 觸發重繪
  useStore((s) => s.revision)

  const parentRef = useRef<HTMLDivElement>(null)

  const rows = useVirtualizer({
    count: grid?.notes.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_H,
    paddingStart: COL_HEADER,
    overscan: 12,
  })

  const columns = useVirtualizer({
    horizontal: true,
    count: grid?.tags.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_W,
    paddingStart: ROW_HEADER,
    overscan: 12,
  })

  if (!grid) return null

  const width = columns.getTotalSize()
  const visibleColumns = columns.getVirtualItems()

  /** 這一列會不會被動到，掃一眼就知道 */
  const flagOf = (row: number) => {
    let add = false
    for (let column = 0; column < grid.tags.length; column += 1) {
      const current = status(cellAt(grid, row, column), thresholds)
      if (current === 'drop' || current === 'suggest-drop') return 'var(--warn)'
      if (current === 'add' || current === 'manual-add') add = true
    }
    return add ? 'var(--review)' : 'transparent'
  }

  return (
    <div className="matrix" ref={parentRef} onMouseLeave={() => setHovered(null)}>
      <div className="matrix-inner" style={{ width, height: rows.getTotalSize() }}>
        <div className="head-row" style={{ width }}>
          <div className="corner">
            {grid.notes.length} 篇 · {grid.tags.length} 類
          </div>
          {visibleColumns.map((column) => (
            <button
              key={column.key}
              className="head-cell"
              style={{ left: column.start, width: column.size }}
              title={`${grid.tags[column.index]}　點一下整欄採納，按住 alt 點整欄退回`}
              onClick={(event) => decideColumn(column.index, !event.altKey)}
            >
              <span>{grid.tags[column.index]}</span>
            </button>
          ))}
        </div>

        {rows.getVirtualItems().map((row) => {
          const note = grid.notes[row.index]
          return (
            <div key={row.key} className="row" style={{ top: row.start, height: row.size, width }}>
              <div className="row-head" title={note.path}>
                <span className="flag" style={{ background: flagOf(row.index) }} />
                <span className="title">{note.title}</span>
              </div>
              {visibleColumns.map((column) => {
                const cell = cellAt(grid, row.index, column.index)
                const node = nodeStyle(cell, thresholds)
                const reading = describeCell(cell, thresholds)
                const tag = grid.tags[column.index]
                const here = { row: row.index, column: column.index }
                return (
                  <button
                    key={column.key}
                    className="cell"
                    style={{ left: column.start }}
                    aria-label={`${note.title}　${tag}　${reading.label}　${reading.score}　寫入時${reading.outcome}　點一下${reading.next}`}
                    onClick={() => toggle(row.index, column.index)}
                    onMouseEnter={() => setHovered(here)}
                    onFocus={() => setHovered(here)}
                  >
                    <Node node={node} className="node" />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

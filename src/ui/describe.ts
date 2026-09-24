import { desired, nextOverride } from '../core/decision'
import type { Cell, Thresholds } from '../core/decision'
import { nodeStyle } from './palette'

/**
 * 一格用白話講出來：現在是什麼、寫入時會怎樣、點下去會變成什麼。
 *
 * 光看結點形狀的變化，使用者不知道自己剛剛做了什麼，所以狀態列跟輔助技術都讀這裡。
 */
export type CellReading = {
  label: string
  score: string
  outcome: string
  next: string
}

function outcomeOf(original: boolean, keep: boolean): string {
  if (keep) return original ? '保留' : '加上'
  return original ? '移除' : '不加'
}

export function describeCell(cell: Cell, thresholds: Thresholds): CellReading {
  const next = nextOverride(cell, thresholds)
  const nextText =
    next === undefined
      ? `回到未決定，寫入時${outcomeOf(cell.original, desired({ ...cell, override: undefined }, thresholds))}`
      : `${outcomeOf(cell.original, next)}這個標籤`

  return {
    label: nodeStyle(cell, thresholds).label,
    score: cell.noul === undefined ? '未判定' : `信心 ${cell.noul.toFixed(2)}`,
    outcome: outcomeOf(cell.original, desired(cell, thresholds)),
    next: nextText,
  }
}

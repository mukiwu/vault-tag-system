/**
 * 每一格的決策邏輯。
 *
 * 刻意把 Jev 給的原始 noul 值留著，分級只在讀取時用門檻算出來，這樣調整門檻
 * 可以即時重算整張矩陣而不需要重打 API。
 */

export type Thresholds = {
  /** 大於等於此值就自動採納 */
  auto: number
  /** 大於等於此值進人工審核，低於則視為不該有 */
  review: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { auto: 0.9, review: 0.4 }

export type Band = 'auto' | 'review' | 'reject'

export type Cell = {
  /** vault 原本有沒有這個標籤 */
  original: boolean
  /** Jev 給的 0 到 1 機率，還沒判定時為 undefined */
  noul?: number
  /** 人工決定，優先於一切 */
  override?: boolean
  /** 已寫回 vault 的時間 */
  appliedAt?: string
}

export type Status =
  /** 原本就有，維持 */
  | 'keep'
  /** 原本沒有，高信心自動加上 */
  | 'add'
  /** 原本沒有，人工加上 */
  | 'manual-add'
  /** 原本有，人工決定移除 */
  | 'drop'
  /** 原本有，但 AI 認為不該有，等人決定 */
  | 'suggest-drop'
  /** 原本沒有，AI 不確定，等人決定 */
  | 'review'
  /** 兩邊都認為不該有 */
  | 'none'

export function band(noul: number, thresholds: Thresholds): Band {
  if (noul >= thresholds.auto) return 'auto'
  if (noul >= thresholds.review) return 'review'
  return 'reject'
}

/**
 * 這一格套用之後該不該有這個標籤。
 *
 * 新增是低風險的，高信心就自動做；移除既有標籤是破壞性的，一律要人點頭，
 * 所以 AI 判定為不該有時只會產生建議，不會自己把標籤拿掉。
 */
export function desired(cell: Cell, thresholds: Thresholds): boolean {
  if (cell.override !== undefined) return cell.override
  if (cell.noul === undefined) return cell.original
  if (cell.original) return true
  return band(cell.noul, thresholds) === 'auto'
}

export function status(cell: Cell, thresholds: Thresholds): Status {
  if (cell.override !== undefined) {
    if (cell.override) return cell.original ? 'keep' : 'manual-add'
    return cell.original ? 'drop' : 'none'
  }

  if (cell.noul === undefined) return cell.original ? 'keep' : 'none'

  const group = band(cell.noul, thresholds)

  if (cell.original) return group === 'reject' ? 'suggest-drop' : 'keep'

  if (group === 'auto') return 'add'
  if (group === 'review') return 'review'
  return 'none'
}

/** 是否還在等人決定 */
export function isPending(cell: Cell, thresholds: Thresholds): boolean {
  const current = status(cell, thresholds)
  return current === 'review' || current === 'suggest-drop'
}

/** 一篇筆記套用之後應該有的標籤，順序沿用傳入的標籤清單 */
export function desiredTags(
  tags: readonly string[],
  cells: ReadonlyMap<string, Cell>,
  thresholds: Thresholds,
): string[] {
  return tags.filter((tag) => desired(cells.get(tag) ?? { original: false }, thresholds))
}

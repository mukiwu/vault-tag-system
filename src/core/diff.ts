import { desired } from './decision'
import type { Cell, Thresholds } from './decision'
import type { Note } from './vault'

/** 把每一格的決策收斂成一篇筆記要怎麼改，寫回時只會照這個結果動 */

export type NoteDiff = {
  path: string
  added: string[]
  removed: string[]
  /** 套用後這篇筆記應該有的完整標籤 */
  nextTags: string[]
  changed: boolean
}

export function planNoteDiff(
  note: Note,
  tags: readonly string[],
  cells: ReadonlyMap<string, Cell>,
  thresholds: Thresholds,
): NoteDiff {
  // 成員檢查一律走 Set。標籤數上百時，用陣列的 includes 會讓每篇筆記變成
  // 平方級的字串比較，整個 vault 加起來足以讓拖動門檻卡住。
  const known = new Set(tags)
  const owned = new Set(note.tags)
  const decided = new Set(
    tags.filter((tag) =>
      // 沒有對應格子時就以筆記現況為準，避免把還沒判定的標籤誤刪
      desired(cells.get(tag) ?? { original: owned.has(tag) }, thresholds),
    ),
  )

  const nextSet = new Set<string>()
  const nextTags: string[] = []

  const push = (tag: string) => {
    if (nextSet.has(tag)) return
    nextSet.add(tag)
    nextTags.push(tag)
  }

  // 先照原本的順序決定哪些留下，字典外的標籤一律原樣保留
  for (const tag of note.tags) {
    if (!known.has(tag) || decided.has(tag)) push(tag)
  }
  // 新增的接在後面，讓改動對原檔的擾動最小
  for (const tag of tags) {
    if (decided.has(tag)) push(tag)
  }

  const added = nextTags.filter((tag) => !owned.has(tag))
  const removed = note.tags.filter((tag) => !nextSet.has(tag))

  return {
    path: note.path,
    added,
    removed,
    nextTags,
    changed: added.length > 0 || removed.length > 0,
  }
}

/** 整個 vault 的待寫清單，只包含真的有變動的筆記 */
export function planDiff(
  notes: readonly Note[],
  tags: readonly string[],
  cellsByNote: ReadonlyMap<string, ReadonlyMap<string, Cell>>,
  thresholds: Thresholds,
): NoteDiff[] {
  const empty = new Map<string, Cell>()
  return notes
    .map((note) => planNoteDiff(note, tags, cellsByNote.get(note.path) ?? empty, thresholds))
    .filter((diff) => diff.changed)
}

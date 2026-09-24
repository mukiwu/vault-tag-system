import { band, isPending, nextOverride, status } from './decision'
import type { Cell, Status, Thresholds } from './decision'
import type { Note } from './vault'

/**
 * 矩陣的資料層。
 *
 * 一個中型 vault 就是幾十萬格，用巢狀物件存會吃掉大量記憶體，而且每次調整都
 * 得整份複製。這裡改用密集的 typed array，單格更新是 O(1)，整欄是 O(筆記數)，
 * 人工覆寫則稀疏地存在 Map 裡。
 */

export type Grid = {
  notes: readonly Note[]
  tags: readonly string[]
  indexByPath: Map<string, number>
  indexByTag: Map<string, number>
  /** 筆記原本有沒有這個標籤 */
  originals: Uint8Array
  /** Jev 給的機率，NaN 代表還沒判定 */
  nouls: Float32Array
  /** 人工決定，只存真的被動過的格子 */
  overrides: Map<number, boolean>
}

export type Verdict = {
  path: string
  noulByTag: ReadonlyMap<string, number>
}

export function createGrid(notes: readonly Note[], tags: readonly string[]): Grid {
  const size = notes.length * tags.length
  const indexByTag = new Map(tags.map((tag, index) => [tag, index]))
  const originals = new Uint8Array(size)
  const nouls = new Float32Array(size).fill(Number.NaN)

  notes.forEach((note, row) => {
    for (const tag of note.tags) {
      const column = indexByTag.get(tag)
      if (column !== undefined) originals[row * tags.length + column] = 1
    }
  })

  return {
    notes,
    tags,
    indexByPath: new Map(notes.map((note, index) => [note.path, index])),
    indexByTag,
    originals,
    nouls,
    overrides: new Map(),
  }
}

const offset = (grid: Grid, row: number, column: number) => row * grid.tags.length + column

export function cellAt(grid: Grid, row: number, column: number): Cell {
  const index = offset(grid, row, column)
  const cell: Cell = { original: grid.originals[index] === 1 }

  const noul = grid.nouls[index]
  if (!Number.isNaN(noul)) cell.noul = noul

  const override = grid.overrides.get(index)
  if (override !== undefined) cell.override = override

  return cell
}

export function applyVerdicts(grid: Grid, verdicts: readonly Verdict[]): void {
  for (const verdict of verdicts) {
    const row = grid.indexByPath.get(verdict.path)
    if (row === undefined) continue

    for (const [tag, noul] of verdict.noulByTag) {
      const column = grid.indexByTag.get(tag)
      if (column === undefined) continue
      grid.nouls[offset(grid, row, column)] = noul
    }
  }
}

export function setOverride(
  grid: Grid,
  row: number,
  column: number,
  value: boolean | undefined,
): void {
  const index = offset(grid, row, column)
  if (value === undefined) grid.overrides.delete(index)
  else grid.overrides.set(index, value)
}

/** 單格點擊，順序見 nextOverride */
export function toggleCell(grid: Grid, row: number, column: number, thresholds: Thresholds): void {
  setOverride(grid, row, column, nextOverride(cellAt(grid, row, column), thresholds))
}

/** 整欄一次決定，已經自動採納或明確排除的格子不需要動 */
export function overrideColumn(
  grid: Grid,
  column: number,
  value: boolean,
  thresholds: Thresholds,
): number {
  let touched = 0
  for (let row = 0; row < grid.notes.length; row += 1) {
    if (!isPending(cellAt(grid, row, column), thresholds)) continue
    setOverride(grid, row, column, value)
    touched += 1
  }
  return touched
}

/** 把整個審核區間一次決定，包含 AI 建議廢棄的既有標籤 */
export function overrideBand(grid: Grid, value: boolean, thresholds: Thresholds): number {
  let touched = 0
  for (let row = 0; row < grid.notes.length; row += 1) {
    for (let column = 0; column < grid.tags.length; column += 1) {
      if (!isPending(cellAt(grid, row, column), thresholds)) continue
      setOverride(grid, row, column, value)
      touched += 1
    }
  }
  return touched
}

export function clearOverrides(grid: Grid): void {
  grid.overrides.clear()
}

/** 一列轉成標籤對格子的對照表，交給差異計算 */
export function rowCells(grid: Grid, row: number): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  grid.tags.forEach((tag, column) => cells.set(tag, cellAt(grid, row, column)))
  return cells
}

export type Summary = Record<Status, number> & { pending: number; judged: boolean }

export function summarize(grid: Grid, thresholds: Thresholds): Summary {
  const counts: Summary = {
    keep: 0,
    add: 0,
    'manual-add': 0,
    drop: 0,
    'suggest-drop': 0,
    review: 0,
    none: 0,
    pending: 0,
    judged: false,
  }

  for (let row = 0; row < grid.notes.length; row += 1) {
    for (let column = 0; column < grid.tags.length; column += 1) {
      const cell = cellAt(grid, row, column)
      const current = status(cell, thresholds)
      counts[current] += 1
      if (current === 'review' || current === 'suggest-drop') counts.pending += 1
      if (cell.noul !== undefined) counts.judged = true
    }
  }

  return counts
}

/**
 * 把判定結果搬到另一張矩陣。
 *
 * 排除資料夾或調整標籤門檻都會換掉矩陣的維度，已經花錢跑出來的判定不該因此消失，
 * 依照路徑與標籤對位搬過去，新出現的格子維持未判定。
 */
export function carryOver(from: Grid, to: Grid): void {
  for (const [path, fromRow] of from.indexByPath) {
    const toRow = to.indexByPath.get(path)
    if (toRow === undefined) continue

    for (const [tag, fromColumn] of from.indexByTag) {
      const toColumn = to.indexByTag.get(tag)
      if (toColumn === undefined) continue

      const fromIndex = fromRow * from.tags.length + fromColumn
      const toIndex = toRow * to.tags.length + toColumn

      to.nouls[toIndex] = from.nouls[fromIndex]

      const override = from.overrides.get(fromIndex)
      if (override !== undefined) to.overrides.set(toIndex, override)
    }
  }
}

/** 給 UI 用的分級，未判定時回 undefined */
export function bandOf(cell: Cell, thresholds: Thresholds) {
  return cell.noul === undefined ? undefined : band(cell.noul, thresholds)
}

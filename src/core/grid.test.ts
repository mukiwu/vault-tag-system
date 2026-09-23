import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from './decision'
import {
  applyVerdicts,
  carryOver,
  cellAt,
  createGrid,
  overrideBand,
  overrideColumn,
  rowCells,
  setOverride,
  summarize,
  toggleCell,
} from './grid'
import type { Note } from './vault'

const T = DEFAULT_THRESHOLDS

const notes: Note[] = [
  { path: 'a.md', title: 'A', tags: ['投資'], excerpt: '' },
  { path: 'b.md', title: 'B', tags: [], excerpt: '' },
]
const tags = ['投資', '讀書筆記']

const fresh = () => createGrid(notes, tags)

describe('createGrid', () => {
  it('從筆記現有的標籤建立初始狀態', () => {
    const grid = fresh()
    expect(cellAt(grid, 0, 0)).toEqual({ original: true })
    expect(cellAt(grid, 0, 1)).toEqual({ original: false })
    expect(cellAt(grid, 1, 0)).toEqual({ original: false })
  })
})

describe('applyVerdicts', () => {
  it('把判定結果填進對應的格子', () => {
    const grid = fresh()
    applyVerdicts(grid, [
      { path: 'a.md', noulByTag: new Map([['讀書筆記', 0.93]]) },
      { path: 'b.md', noulByTag: new Map([['投資', 0.12]]) },
    ])

    expect(cellAt(grid, 0, 1).noul).toBeCloseTo(0.93)
    expect(cellAt(grid, 1, 0).noul).toBeCloseTo(0.12)
    // 沒有判定到的格子維持未判定
    expect(cellAt(grid, 1, 1).noul).toBeUndefined()
  })

  it('忽略不認得的路徑與標籤', () => {
    const grid = fresh()
    expect(() =>
      applyVerdicts(grid, [{ path: '不存在.md', noulByTag: new Map([['沒看過的標籤', 0.9]]) }]),
    ).not.toThrow()
  })
})

describe('setOverride 與 toggleCell', () => {
  it('人工決定會蓋過判定結果', () => {
    const grid = fresh()
    applyVerdicts(grid, [{ path: 'b.md', noulByTag: new Map([['投資', 0.12]]) }])

    setOverride(grid, 1, 0, true)
    expect(cellAt(grid, 1, 0).override).toBe(true)

    setOverride(grid, 1, 0, undefined)
    expect(cellAt(grid, 1, 0).override).toBeUndefined()
  })

  it('單格點擊在採納與退回之間切換，第三次回到未決定', () => {
    const grid = fresh()
    applyVerdicts(grid, [{ path: 'b.md', noulByTag: new Map([['投資', 0.6]]) }])

    toggleCell(grid, 1, 0)
    expect(cellAt(grid, 1, 0).override).toBe(true)
    toggleCell(grid, 1, 0)
    expect(cellAt(grid, 1, 0).override).toBe(false)
    toggleCell(grid, 1, 0)
    expect(cellAt(grid, 1, 0).override).toBeUndefined()
  })
})

describe('overrideColumn', () => {
  it('整欄一次決定，只動還在等人決定的格子', () => {
    const grid = fresh()
    applyVerdicts(grid, [
      { path: 'a.md', noulByTag: new Map([['讀書筆記', 0.6]]) },
      { path: 'b.md', noulByTag: new Map([['讀書筆記', 0.97]]) },
    ])

    overrideColumn(grid, 1, true, T)

    expect(cellAt(grid, 0, 1).override).toBe(true)
    // 已經自動採納的格子不需要被標成人工決定
    expect(cellAt(grid, 1, 1).override).toBeUndefined()
  })
})

describe('overrideBand', () => {
  it('把所有待審的格子一次決定', () => {
    const grid = fresh()
    applyVerdicts(grid, [
      { path: 'a.md', noulByTag: new Map([['讀書筆記', 0.6]]) },
      { path: 'b.md', noulByTag: new Map([['投資', 0.5]]) },
    ])

    const touched = overrideBand(grid, false, T)

    expect(touched).toBe(2)
    expect(cellAt(grid, 0, 1).override).toBe(false)
    expect(cellAt(grid, 1, 0).override).toBe(false)
  })

  it('包含 AI 建議廢棄的既有標籤', () => {
    const grid = fresh()
    applyVerdicts(grid, [{ path: 'a.md', noulByTag: new Map([['投資', 0.03]]) }])

    expect(overrideBand(grid, false, T)).toBe(1)
    expect(cellAt(grid, 0, 0).override).toBe(false)
  })
})

describe('rowCells', () => {
  it('把一列轉成標籤對格子的對照表，供差異計算使用', () => {
    const grid = fresh()
    applyVerdicts(grid, [{ path: 'a.md', noulByTag: new Map([['讀書筆記', 0.93]]) }])

    const row = rowCells(grid, 0)
    expect(row.get('投資')).toEqual({ original: true })
    expect(row.get('讀書筆記')?.noul).toBeCloseTo(0.93)
  })
})

describe('summarize', () => {
  it('統計各狀態的格子數量，供工具列顯示', () => {
    const grid = fresh()
    applyVerdicts(grid, [
      { path: 'a.md', noulByTag: new Map([['讀書筆記', 0.97]]) },
      { path: 'b.md', noulByTag: new Map([['投資', 0.6]]) },
    ])

    const counts = summarize(grid, T)
    expect(counts.add).toBe(1)
    expect(counts.review).toBe(1)
    expect(counts.keep).toBe(1)
  })
})

describe('carryOver', () => {
  const build = (paths: string[], tagList: string[]) =>
    createGrid(
      paths.map((path) => ({ path, title: path, tags: [], excerpt: '' })),
      tagList,
    )

  it('換一張矩陣時把判定值搬過去，不用重跑', () => {
    const before = build(['a.md', 'b.md'], ['投資', '讀書筆記'])
    applyVerdicts(before, [{ path: 'b.md', noulByTag: new Map([['讀書筆記', 0.93]]) }])

    const after = build(['b.md', 'c.md'], ['讀書筆記', '食譜'])
    carryOver(before, after)

    expect(cellAt(after, 0, 0).noul).toBeCloseTo(0.93)
  })

  it('人工決定也一起搬', () => {
    const before = build(['a.md'], ['投資'])
    setOverride(before, 0, 0, false)

    const after = build(['a.md'], ['讀書筆記', '投資'])
    carryOver(before, after)

    expect(cellAt(after, 0, 1).override).toBe(false)
  })

  it('新矩陣沒有的筆記或標籤就跳過，不會出錯', () => {
    const before = build(['a.md'], ['投資'])
    applyVerdicts(before, [{ path: 'a.md', noulByTag: new Map([['投資', 0.9]]) }])

    const after = build(['z.md'], ['食譜'])
    expect(() => carryOver(before, after)).not.toThrow()
    expect(cellAt(after, 0, 0).noul).toBeUndefined()
  })

  it('新矩陣多出來的格子維持未判定', () => {
    const before = build(['a.md'], ['投資'])
    applyVerdicts(before, [{ path: 'a.md', noulByTag: new Map([['投資', 0.9]]) }])

    const after = build(['a.md', 'b.md'], ['投資'])
    carryOver(before, after)

    expect(cellAt(after, 0, 0).noul).toBeCloseTo(0.9)
    expect(cellAt(after, 1, 0).noul).toBeUndefined()
  })
})

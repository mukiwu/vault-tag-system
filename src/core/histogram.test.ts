import { describe, expect, it } from 'vitest'
import { applyVerdicts, createGrid } from './grid'
import { histogram } from './histogram'
import type { Note } from './vault'

const notes: Note[] = [
  { path: 'a.md', title: 'A', tags: [], excerpt: '' },
  { path: 'b.md', title: 'B', tags: [], excerpt: '' },
]
const tags = ['投資', '讀書筆記']

const gridWith = (values: Record<string, Record<string, number>>) => {
  const grid = createGrid(notes, tags)
  applyVerdicts(
    grid,
    Object.entries(values).map(([path, byTag]) => ({ path, noulByTag: new Map(Object.entries(byTag)) })),
  )
  return grid
}

describe('histogram', () => {
  it('把判定值分進對應的區間', () => {
    const grid = gridWith({ 'a.md': { 投資: 0.05, 讀書筆記: 0.95 } })
    const bins = histogram(grid, 10)

    expect(bins).toHaveLength(10)
    expect(bins[0]).toBe(1)
    expect(bins[9]).toBe(1)
    expect(bins.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('還沒判定的格子不算進去', () => {
    const grid = gridWith({ 'a.md': { 投資: 0.5 } })
    expect(histogram(grid, 10).reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('剛好 1.0 要落在最後一個區間，不能溢位', () => {
    const grid = gridWith({ 'a.md': { 投資: 1 } })
    const bins = histogram(grid, 10)
    expect(bins[9]).toBe(1)
    expect(bins).toHaveLength(10)
  })

  it('完全沒有判定時每個區間都是零', () => {
    expect(histogram(createGrid(notes, tags), 8)).toEqual(new Array(8).fill(0))
  })
})

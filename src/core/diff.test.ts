import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from './decision'
import type { Cell } from './decision'
import { planDiff, planNoteDiff } from './diff'
import type { Note } from './vault'

const T = DEFAULT_THRESHOLDS

const note = (tags: string[]): Note => ({ path: 'a.md', title: 'A', tags, excerpt: '' })

const cells = (entries: Record<string, Cell>) => new Map(Object.entries(entries))

describe('planNoteDiff', () => {
  it('算出要加哪些標籤', () => {
    const diff = planNoteDiff(
      note(['投資']),
      ['投資', '讀書筆記'],
      cells({ 投資: { original: true }, 讀書筆記: { original: false, noul: 0.96 } }),
      T,
    )
    expect(diff).toMatchObject({
      added: ['讀書筆記'],
      removed: [],
      nextTags: ['投資', '讀書筆記'],
      changed: true,
    })
  })

  it('人工決定移除時才會有 removed', () => {
    const diff = planNoteDiff(
      note(['投資', '舊標籤']),
      ['投資', '舊標籤'],
      cells({
        投資: { original: true, noul: 0.99 },
        舊標籤: { original: true, noul: 0.02, override: false },
      }),
      T,
    )
    expect(diff).toMatchObject({ added: [], removed: ['舊標籤'], nextTags: ['投資'] })
  })

  it('AI 建議廢棄但還沒有人點頭時，標籤先留著', () => {
    const diff = planNoteDiff(
      note(['舊標籤']),
      ['舊標籤'],
      cells({ 舊標籤: { original: true, noul: 0.02 } }),
      T,
    )
    expect(diff).toMatchObject({ removed: [], nextTags: ['舊標籤'], changed: false })
  })

  it('不在標籤字典裡的既有標籤要原樣保留，不能因為沒被判定就消失', () => {
    const diff = planNoteDiff(
      note(['冷門標籤', '投資']),
      ['投資'],
      cells({ 投資: { original: true, noul: 0.99 } }),
      T,
    )
    expect(diff.nextTags).toEqual(['冷門標籤', '投資'])
    expect(diff.changed).toBe(false)
  })

  it('保留原有標籤的順序，新增的接在後面', () => {
    const diff = planNoteDiff(
      note(['丙', '甲']),
      ['甲', '乙', '丙'],
      cells({
        甲: { original: true },
        乙: { original: false, noul: 0.98 },
        丙: { original: true },
      }),
      T,
    )
    expect(diff.nextTags).toEqual(['丙', '甲', '乙'])
  })

  it('沒有變動時 changed 是 false', () => {
    const diff = planNoteDiff(
      note(['投資']),
      ['投資'],
      cells({ 投資: { original: true, noul: 0.99 } }),
      T,
    )
    expect(diff).toMatchObject({ added: [], removed: [], changed: false })
  })
})

describe('planDiff', () => {
  const notes = [
    { path: 'a.md', title: 'A', tags: [] as string[], excerpt: '' },
    { path: 'b.md', title: 'B', tags: ['投資'], excerpt: '' },
  ]

  it('只回傳真的有變動的筆記', () => {
    const byNote = new Map([
      ['a.md', cells({ 投資: { original: false, noul: 0.97 } })],
      ['b.md', cells({ 投資: { original: true, noul: 0.97 } })],
    ])

    const diffs = planDiff(notes, ['投資'], byNote, T)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]).toMatchObject({ path: 'a.md', added: ['投資'] })
  })

  it('沒有任何變動時回空陣列', () => {
    expect(planDiff(notes, ['投資'], new Map(), T)).toEqual([])
  })
})

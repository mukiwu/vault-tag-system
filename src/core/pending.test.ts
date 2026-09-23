import { describe, expect, it } from 'vitest'
import { groupChanges } from './pending'
import type { NoteDiff } from './diff'

const diff = (path: string, added: string[], removed: string[] = []): NoteDiff => ({
  path,
  added,
  removed,
  nextTags: added,
  changed: true,
})

const titles = new Map([
  ['a.md', '半導體觀察'],
  ['b.md', '資產配置'],
  ['c.md', '待整理的雜記'],
])

describe('groupChanges', () => {
  it('按標籤把要加的筆數聚起來', () => {
    const groups = groupChanges([diff('a.md', ['投資']), diff('b.md', ['投資'])], titles)
    expect(groups).toEqual([
      { tag: '投資', kind: 'add', count: 2, samples: ['半導體觀察', '資產配置'] },
    ])
  })

  it('要移除的獨立成一筆，不跟新增混在一起', () => {
    const groups = groupChanges([diff('a.md', ['投資']), diff('c.md', [], ['投資'])], titles)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.kind)).toEqual(['add', 'remove'])
  })

  it('新增排在移除前面，各自依筆數由多到少', () => {
    const groups = groupChanges(
      [
        diff('a.md', ['運動']),
        diff('b.md', ['投資']),
        diff('c.md', ['投資'], ['食譜']),
      ],
      titles,
    )
    expect(groups.map((g) => [g.kind, g.tag, g.count])).toEqual([
      ['add', '投資', 2],
      ['add', '運動', 1],
      ['remove', '食譜', 1],
    ])
  })

  it('代表性標題有上限，不會無限長', () => {
    const many = Array.from({ length: 20 }, (_, i) => diff(`${i}.md`, ['投資']))
    const [group] = groupChanges(many, new Map(), { maxSamples: 3 })
    expect(group.count).toBe(20)
    expect(group.samples).toHaveLength(3)
  })

  it('查不到標題時退回用路徑', () => {
    const [group] = groupChanges([diff('未知.md', ['投資'])], new Map())
    expect(group.samples).toEqual(['未知.md'])
  })

  it('沒有變更時回空陣列', () => {
    expect(groupChanges([], titles)).toEqual([])
  })
})

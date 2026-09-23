import { describe, expect, it } from 'vitest'
import { excludeFolders, folderStats, folderTree, isExcludedByAncestor } from './folders'
import type { Note } from './vault'

const note = (path: string): Note => ({ path, title: path, tags: [], excerpt: '' })

const notes = [
  note('投資/a.md'),
  note('投資/b.md'),
  note('讀書/c.md'),
  note('附件/candidate_1.md'),
  note('附件/candidate_2.md'),
  note('附件/candidate_3.md'),
  note('根目錄.md'),
]

describe('folderStats', () => {
  it('依直接所在的資料夾統計，篇數多的排前面', () => {
    expect(folderStats(notes)).toEqual([
      { folder: '附件', count: 3 },
      { folder: '投資', count: 2 },
      { folder: '', count: 1 },
      { folder: '讀書', count: 1 },
    ])
  })

  it('巢狀資料夾用完整路徑當識別，不會混在一起', () => {
    const nested = [note('a/b/x.md'), note('a/c/y.md'), note('a/b/z.md')]
    expect(folderStats(nested)).toEqual([
      { folder: 'a/b', count: 2 },
      { folder: 'a/c', count: 1 },
    ])
  })

  it('沒有筆記時回空陣列', () => {
    expect(folderStats([])).toEqual([])
  })
})

describe('excludeFolders', () => {
  it('排除整個資料夾', () => {
    const kept = excludeFolders(notes, new Set(['附件']))
    expect(kept.map((n) => n.path)).toEqual([
      '投資/a.md',
      '投資/b.md',
      '讀書/c.md',
      '根目錄.md',
    ])
  })

  it('排除父資料夾時，底下的子資料夾也一起排除', () => {
    const nested = [note('a/b/x.md'), note('a/c/y.md'), note('d/z.md')]
    expect(excludeFolders(nested, new Set(['a'])).map((n) => n.path)).toEqual(['d/z.md'])
  })

  it('名稱只是前綴相同的資料夾不會被誤殺', () => {
    const similar = [note('附件/x.md'), note('附件庫/y.md')]
    expect(excludeFolders(similar, new Set(['附件'])).map((n) => n.path)).toEqual(['附件庫/y.md'])
  })

  it('排除根目錄只影響根目錄的筆記', () => {
    expect(excludeFolders(notes, new Set([''])).map((n) => n.path)).not.toContain('根目錄.md')
    expect(excludeFolders(notes, new Set([''])).map((n) => n.path)).toContain('投資/a.md')
  })

  it('沒有排除任何資料夾時原樣回傳', () => {
    expect(excludeFolders(notes, new Set())).toHaveLength(notes.length)
  })
})

describe('folderTree', () => {
  const tree = folderTree([
    note('projects/國際貿易/a.md'),
    note('projects/國際貿易/b.md'),
    note('projects/家庭/c.md'),
    note('projects/d.md'),
    note('attachments/x.md'),
    note('根目錄.md'),
  ])

  it('依路徑長出巢狀結構', () => {
    expect(tree.map((n) => n.path)).toEqual(['attachments', 'projects', ''])
    const projects = tree.find((n) => n.path === 'projects')
    expect(projects?.children.map((n) => n.name)).toEqual(['國際貿易', '家庭'])
  })

  it('count 是直接放在這層的篇數，total 含所有子孫', () => {
    const projects = tree.find((n) => n.path === 'projects')
    expect(projects?.count).toBe(1)
    expect(projects?.total).toBe(4)
  })

  it('子節點帶完整路徑，才能對應到排除設定', () => {
    const projects = tree.find((n) => n.path === 'projects')
    expect(projects?.children.map((n) => n.path)).toEqual([
      'projects/國際貿易',
      'projects/家庭',
    ])
  })

  it('同層依名稱排序，根目錄排在最後', () => {
    expect(tree.at(-1)?.path).toBe('')
    expect(tree.at(-1)?.count).toBe(1)
  })

  it('中間層沒有檔案時仍然要出現，否則樹會斷掉', () => {
    const deep = folderTree([note('a/b/c/x.md')])
    expect(deep[0].path).toBe('a')
    expect(deep[0].count).toBe(0)
    expect(deep[0].total).toBe(1)
    expect(deep[0].children[0].children[0].path).toBe('a/b/c')
  })

  it('沒有筆記時回空陣列', () => {
    expect(folderTree([])).toEqual([])
  })
})

describe('isExcludedByAncestor', () => {
  it('父資料夾被排除時，子資料夾算是被連帶排除', () => {
    expect(isExcludedByAncestor('a/b/c', new Set(['a']))).toBe(true)
    expect(isExcludedByAncestor('a/b/c', new Set(['a/b']))).toBe(true)
  })

  it('自己被排除不算被祖先排除', () => {
    expect(isExcludedByAncestor('a/b', new Set(['a/b']))).toBe(false)
  })

  it('名稱只是前綴相同的不算', () => {
    expect(isExcludedByAncestor('附件庫/x', new Set(['附件']))).toBe(false)
  })

  it('根目錄沒有祖先', () => {
    expect(isExcludedByAncestor('', new Set(['a']))).toBe(false)
  })
})

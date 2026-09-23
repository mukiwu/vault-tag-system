import { describe, expect, it } from 'vitest'
import { buildTagDictionary, collectNotes, excerptOf, toNote } from './vault'

describe('toNote', () => {
  it('抽出路徑、標題、原有標籤與內文摘要', () => {
    const note = toNote('筆記/投資/2024 年回顧.md', `---\ntags:\n  - 投資\n---\n# 標題\n\n內文`)
    expect(note).toMatchObject({
      path: '筆記/投資/2024 年回顧.md',
      title: '2024 年回顧',
      tags: ['投資'],
    })
    expect(note.excerpt).toBe('# 標題\n\n內文')
  })

  it('frontmatter 有 title 時優先採用', () => {
    const note = toNote('notes/a.md', `---\ntitle: 真正的標題\n---\n內文`)
    expect(note.title).toBe('真正的標題')
  })

  it('沒有 frontmatter 時也能處理', () => {
    const note = toNote('a.md', '只有內文')
    expect(note).toMatchObject({ title: 'a', tags: [], excerpt: '只有內文' })
  })
})

describe('excerptOf', () => {
  it('去掉 frontmatter 只留內文', () => {
    expect(excerptOf(`---\ntags:\n  - 投資\n---\n內文`, 100)).toBe('內文')
  })

  it('壓掉多餘空行，避免浪費 token', () => {
    expect(excerptOf('第一段\n\n\n\n第二段', 100)).toBe('第一段\n\n第二段')
  })

  it('超過長度就裁切', () => {
    expect(excerptOf('一'.repeat(50), 10)).toHaveLength(10)
  })

  it('內容在長度之內時不動它', () => {
    expect(excerptOf('短內文', 100)).toBe('短內文')
  })
})

describe('buildTagDictionary', () => {
  const notes = [
    { path: 'a.md', title: 'A', tags: ['投資', '讀書筆記'], excerpt: '' },
    { path: 'b.md', title: 'B', tags: ['投資'], excerpt: '' },
    { path: 'c.md', title: 'C', tags: ['投資', '食譜'], excerpt: '' },
    { path: 'd.md', title: 'D', tags: ['讀書筆記'], excerpt: '' },
  ]

  it('統計每個標籤的使用次數，依次數由多到少排序', () => {
    const dict = buildTagDictionary(notes)
    expect(dict.map((t) => [t.tag, t.count])).toEqual([
      ['投資', 3],
      ['讀書筆記', 2],
      ['食譜', 1],
    ])
  })

  it('每個標籤附上代表性筆記標題，供判定時對齊既有用法', () => {
    const dict = buildTagDictionary(notes)
    expect(dict.find((t) => t.tag === '投資')?.samples).toEqual(['A', 'B', 'C'])
  })

  it('代表性標題數量有上限', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      path: `${i}.md`,
      title: `筆記${i}`,
      tags: ['投資'],
      excerpt: '',
    }))
    expect(buildTagDictionary(many, { maxSamples: 3 })[0].samples).toHaveLength(3)
  })

  it('可以濾掉只用過一次的零星標籤', () => {
    const dict = buildTagDictionary(notes, { minCount: 2 })
    expect(dict.map((t) => t.tag)).toEqual(['投資', '讀書筆記'])
  })

  it('沒有標籤時回空陣列', () => {
    expect(buildTagDictionary([])).toEqual([])
  })
})

describe('collectNotes', () => {
  const files = [
    { path: 'a.md', source: `---\ntags:\n  - 投資\n---\n內文` },
    { path: 'b.md', source: '沒有 frontmatter 的純內文' },
    { path: 'c.md', source: `---\ntitle: 只有標題沒有標籤\n---\n內文` },
    { path: 'd.txt', source: `---\ntags:\n  - 投資\n---\n內文` },
    { path: 'e.markdown', source: `---\ntags:\n  - 投資\n---\n內文` },
  ]

  it('只收 .md 而且有 frontmatter 的檔案', () => {
    const { notes } = collectNotes(files)
    expect(notes.map((n) => n.path)).toEqual(['a.md', 'c.md'])
  })

  it('回報被跳過的數量，讓畫面上說得出來', () => {
    const { skipped } = collectNotes(files)
    expect(skipped).toEqual({ noFrontmatter: 1, notMarkdown: 2 })
  })

  it('有 frontmatter 但沒有 tags 欄位的仍然要處理', () => {
    const { notes } = collectNotes([files[2]])
    expect(notes).toHaveLength(1)
    expect(notes[0].tags).toEqual([])
  })

  it('副檔名大小寫不影響判斷', () => {
    const { notes } = collectNotes([{ path: 'A.MD', source: `---\ntags:\n  - 投資\n---\n內文` }])
    expect(notes).toHaveLength(1)
  })

  it('沒有檔案時回空結果', () => {
    expect(collectNotes([])).toEqual({ notes: [], skipped: { noFrontmatter: 0, notMarkdown: 0 } })
  })
})

import { describe, expect, it } from 'vitest'
import { hasFrontmatter, readTags, writeTags } from './frontmatter'

// 一篇筆記的內文，用來驗證 frontmatter 以外的部分逐字元不變
const BODY = `# 標題

這裡有一段內文，裡面故意出現一條分隔線：

---

還有一段 YAML 風格的假 frontmatter 混在內文：

tags:
  - 這不是真的標籤

結尾`

describe('hasFrontmatter', () => {
  it('認得檔案開頭的 frontmatter', () => {
    expect(hasFrontmatter(`---\ntags:\n  - 投資\n---\n${BODY}`)).toBe(true)
    expect(hasFrontmatter(`---\ntitle: 只有標題\n---\n${BODY}`)).toBe(true)
  })

  it('沒有 frontmatter 的純內文不算', () => {
    expect(hasFrontmatter(BODY)).toBe(false)
    expect(hasFrontmatter('')).toBe(false)
  })

  it('內文中間長得像 frontmatter 的段落不算', () => {
    expect(hasFrontmatter(`# 開頭不是分隔線\n---\ntags:\n  - 假的\n---\n`)).toBe(false)
  })

  it('開頭有分隔線但沒有收尾的不算', () => {
    expect(hasFrontmatter('---\ntags:\n  - 沒有收尾')).toBe(false)
  })
})

describe('readTags', () => {
  it('讀不到 frontmatter 時回空陣列', () => {
    expect(readTags(BODY)).toEqual([])
  })

  it('讀得懂區塊列表', () => {
    const src = `---\ntitle: 測試\ntags:\n  - 投資\n  - 讀書筆記\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資', '讀書筆記'])
  })

  it('讀得懂行內陣列', () => {
    const src = `---\ntags: [投資, 讀書筆記]\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資', '讀書筆記'])
  })

  it('讀得懂逗號分隔字串', () => {
    const src = `---\ntags: 投資, 讀書筆記\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資', '讀書筆記'])
  })

  it('讀得懂單數的 tag 欄位', () => {
    const src = `---\ntag: 投資\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資'])
  })

  it('去掉標籤前面的井字號與引號', () => {
    const src = `---\ntags: ["#投資", '讀書筆記']\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資', '讀書筆記'])
  })

  it('保留巢狀標籤的斜線', () => {
    const src = `---\ntags:\n  - 投資/美股\n---\n${BODY}`
    expect(readTags(src)).toEqual(['投資/美股'])
  })

  it('tags 欄位存在但沒有值時回空陣列', () => {
    const src = `---\ntitle: 測試\ntags:\n---\n${BODY}`
    expect(readTags(src)).toEqual([])
  })

  it('不會把內文裡長得像 frontmatter 的段落當成 frontmatter', () => {
    const src = `# 開頭不是分隔線\n---\ntags:\n  - 假的\n---\n`
    expect(readTags(src)).toEqual([])
  })
})

describe('writeTags', () => {
  it('就地替換區塊列表，其餘位元組完全不動', () => {
    const src = `---\ntitle: 測試\ntags:\n  - 投資\n---\n${BODY}`
    const out = writeTags(src, ['投資', '讀書筆記'])
    expect(out).toBe(`---\ntitle: 測試\ntags:\n  - 投資\n  - 讀書筆記\n---\n${BODY}`)
  })

  it('沿用行內陣列的風格', () => {
    const src = `---\ntags: [投資]\n---\n${BODY}`
    const out = writeTags(src, ['投資', '讀書筆記'])
    expect(out).toBe(`---\ntags: [投資, 讀書筆記]\n---\n${BODY}`)
  })

  it('保留 tags 前後的其他欄位與其原始排版', () => {
    const src = `---\ntitle:   前面留白沒被動過\ntags:\n  - 投資\naliases:\n  - 別名\n---\n${BODY}`
    const out = writeTags(src, ['讀書筆記'])
    expect(out).toBe(
      `---\ntitle:   前面留白沒被動過\ntags:\n  - 讀書筆記\naliases:\n  - 別名\n---\n${BODY}`,
    )
  })

  it('有 frontmatter 但沒有 tags 欄位時，補在 frontmatter 尾端', () => {
    const src = `---\ntitle: 測試\n---\n${BODY}`
    const out = writeTags(src, ['投資'])
    expect(out).toBe(`---\ntitle: 測試\ntags:\n  - 投資\n---\n${BODY}`)
  })

  it('完全沒有 frontmatter 時，在最前面補一段', () => {
    const out = writeTags(BODY, ['投資'])
    expect(out).toBe(`---\ntags:\n  - 投資\n---\n${BODY}`)
  })

  it('標籤清空時移除整個 tags 欄位', () => {
    const src = `---\ntitle: 測試\ntags:\n  - 投資\n---\n${BODY}`
    const out = writeTags(src, [])
    expect(out).toBe(`---\ntitle: 測試\n---\n${BODY}`)
  })

  it('標籤清空且 frontmatter 只剩 tags 時，整段 frontmatter 一起移除', () => {
    const src = `---\ntags:\n  - 投資\n---\n${BODY}`
    expect(writeTags(src, [])).toBe(BODY)
  })

  it('沒有 frontmatter 又寫入空標籤時，原文原封不動', () => {
    expect(writeTags(BODY, [])).toBe(BODY)
  })

  it('保留 CRLF 換行', () => {
    const src = `---\r\ntitle: 測試\r\ntags:\r\n  - 投資\r\n---\r\n# 內文\r\n`
    const out = writeTags(src, ['投資', '讀書筆記'])
    expect(out).toBe(`---\r\ntitle: 測試\r\ntags:\r\n  - 投資\r\n  - 讀書筆記\r\n---\r\n# 內文\r\n`)
  })

  it('寫入後讀回來要拿到一樣的標籤', () => {
    const tags = ['投資/美股', '讀書筆記', 'Reading']
    for (const src of [BODY, `---\ntitle: 測試\n---\n${BODY}`, `---\ntags: [舊]\n---\n${BODY}`]) {
      expect(readTags(writeTags(src, tags))).toEqual(tags)
    }
  })

  it('寫入相同的標籤時，輸出與原文完全相同', () => {
    const src = `---\ntitle: 測試\ntags:\n  - 投資\n  - 讀書筆記\n---\n${BODY}`
    expect(writeTags(src, ['投資', '讀書筆記'])).toBe(src)
  })
})

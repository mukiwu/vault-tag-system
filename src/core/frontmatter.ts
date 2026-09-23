/**
 * 極小的 frontmatter tags 讀寫層。
 *
 * 刻意不使用 gray-matter 這類會整份重新序列化 YAML 的工具：這個系統會把標籤
 * 寫回使用者真正的筆記，任何對其他欄位的重排、引號變化或縮排調整都是災難。
 * 這裡只精準定位 tags 欄位所佔的區間並就地替換，其餘位元組原封不動。
 */

const DEFAULT_EOL = '\n'
const DEFAULT_INDENT = '  '

type Block = {
  /** frontmatter 內容（不含前後的 --- 界線）在原文中的起點 */
  innerStart: number
  /** frontmatter 內容的終點 */
  innerEnd: number
  /** 整段 frontmatter（含界線與結尾換行）的終點 */
  blockEnd: number
  /** 開頭界線後的換行，用來沿用 LF 或 CRLF */
  eol: string
  /** 結尾界線後的換行，檔案結束於界線時為空字串 */
  closeEol: string
}

/** frontmatter 必須從檔案第一個位元組開始，內文中長得像的段落不算數 */
function findBlock(source: string): Block | null {
  const open = /^---(\r?\n)/.exec(source)
  if (!open) return null

  const eol = open[1]
  const innerStart = open[0].length

  const close = /(\r?\n)---(\r?\n|$)/g
  // 從開頭界線的換行處起算，這樣空的 frontmatter 也找得到結尾
  close.lastIndex = innerStart - eol.length
  const found = close.exec(source)
  if (!found) return null

  return {
    innerStart,
    innerEnd: Math.max(found.index, innerStart),
    blockEnd: found.index + found[0].length,
    eol,
    closeEol: found[2],
  }
}

type Field = {
  /** tags 欄位在 inner 中的起點（行首） */
  start: number
  /** 欄位最後一行的終點，不含尾隨換行 */
  end: number
  /** 原始的欄位名稱，tags 或 tag，寫回時沿用 */
  key: string
  /** 冒號之後的原始內容 */
  inlineValue: string
  /** 區塊列表各項的原始文字 */
  items: string[]
  /** 區塊列表的縮排，沿用原有排版 */
  indent: string
}

function findField(inner: string): Field | null {
  const head = /(^|\r?\n)(tags?)[ \t]*:(.*)/i.exec(inner)
  if (!head) return null

  const start = head.index + head[1].length
  const inlineValue = head[3]
  let end = start + head[0].length - head[1].length

  const items: string[] = []
  let indent = DEFAULT_INDENT

  // 冒號後沒有內容時，後續縮排的 - 項目都屬於這個欄位
  if (inlineValue.trim() === '') {
    const rest = inner.slice(end)
    const line = new RegExp(`^(\\r?\\n)([ \\t]*)-[ \\t]*(.*)`)
    let cursor = rest
    let consumed = 0
    for (;;) {
      const m = line.exec(cursor)
      if (!m) break
      if (items.length === 0) indent = m[2]
      items.push(m[3])
      consumed += m[0].length
      cursor = cursor.slice(m[0].length)
    }
    end += consumed
  }

  return { start, end, key: head[2], inlineValue, items, indent }
}

/** 去掉外層引號與 Obsidian 內文標籤的井字號前綴 */
function clean(value: string): string {
  let out = value.trim()
  const quoted = /^(['"])(.*)\1$/.exec(out)
  if (quoted) out = quoted[2]
  out = out.trim()
  if (out.startsWith('#')) out = out.slice(1)
  return out.trim()
}

function splitInline(value: string): string[] {
  const trimmed = value.trim()
  const list = trimmed.startsWith('[') ? trimmed.replace(/^\[/, '').replace(/\]$/, '') : trimmed
  return list
    .split(',')
    .map(clean)
    .filter((tag) => tag !== '')
}

/** 讀出一篇筆記 frontmatter 中的標籤，讀不到時回空陣列 */
export function readTags(source: string): string[] {
  const block = findBlock(source)
  if (!block) return []

  const inner = source.slice(block.innerStart, block.innerEnd)
  const field = findField(inner)
  if (!field) return []

  if (field.inlineValue.trim() !== '') return splitInline(field.inlineValue)
  return field.items.map(clean).filter((tag) => tag !== '')
}

function renderField(field: Field | null, tags: string[], eol: string): string {
  const key = field?.key ?? 'tags'
  // 原本寫成行內陣列的就維持行內陣列，原本是逗號分隔純量的也維持原樣
  if (field && field.inlineValue.trim().startsWith('[')) {
    return `${key}: [${tags.join(', ')}]`
  }
  if (field && field.inlineValue.trim() !== '') {
    return `${key}: ${tags.join(', ')}`
  }
  const indent = field?.indent ?? DEFAULT_INDENT
  return [`${key}:`, ...tags.map((tag) => `${indent}- ${tag}`)].join(eol)
}

/**
 * 把標籤寫回 frontmatter，只動 tags 欄位所佔的區間。
 * 傳入空陣列代表移除 tags 欄位；若移除後 frontmatter 什麼都不剩，整段一起拿掉。
 */
export function writeTags(source: string, tags: string[]): string {
  const block = findBlock(source)

  if (!block) {
    if (tags.length === 0) return source
    const field = renderField(null, tags, DEFAULT_EOL)
    return `---${DEFAULT_EOL}${field}${DEFAULT_EOL}---${DEFAULT_EOL}${source}`
  }

  const inner = source.slice(block.innerStart, block.innerEnd)
  const field = findField(inner)
  const head = source.slice(0, block.innerStart)
  const tail = source.slice(block.blockEnd)

  let nextInner: string
  if (tags.length === 0) {
    if (!field) return source
    // 連同欄位所在行的換行一起移除，避免留下空行
    nextInner =
      field.start === 0
        ? inner.slice(Math.min(field.end + block.eol.length, inner.length))
        : inner.slice(0, field.start - block.eol.length) + inner.slice(field.end)
  } else if (field) {
    nextInner =
      inner.slice(0, field.start) + renderField(field, tags, block.eol) + inner.slice(field.end)
  } else {
    const rendered = renderField(null, tags, block.eol)
    nextInner = inner === '' ? rendered : inner + block.eol + rendered
  }

  if (nextInner.trim() === '') return tail

  return `${head}${nextInner}${block.eol}---${block.closeEol}${tail}`
}

/** 這篇筆記有沒有 frontmatter，沒有的一律不納入處理 */
export function hasFrontmatter(source: string): boolean {
  return findBlock(source) !== null
}

/** 讀出 frontmatter 中某個純量欄位的值，找不到時回 null */
export function readField(source: string, key: string): string | null {
  const block = findBlock(source)
  if (!block) return null

  const inner = source.slice(block.innerStart, block.innerEnd)
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new RegExp(`(^|\\r?\\n)${escaped}[ \\t]*:(.*)`, 'i').exec(inner)
  if (!found) return null

  const value = clean(found[2])
  return value === '' ? null : value
}

/** 去掉整段 frontmatter，只留下內文 */
export function stripFrontmatter(source: string): string {
  const block = findBlock(source)
  return block ? source.slice(block.blockEnd) : source
}

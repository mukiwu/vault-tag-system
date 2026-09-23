import { hasFrontmatter, readField, readTags, stripFrontmatter } from './frontmatter'

/**
 * 把讀進來的 markdown 整理成判定所需的最小形狀，並從整個 vault 的既有標籤
 * 統計出標籤字典。字典會餵回給 Jev 當作判定依據，讓判斷貼著這個 vault 的
 * 實際用法走，而不是套用通用語意。
 */

export type Note = {
  /** vault 內的相對路徑，同時當作筆記的識別碼 */
  path: string
  title: string
  /** 筆記原本就有的標籤 */
  tags: string[]
  /** 裁切過的內文，送給 Jev 當 state */
  excerpt: string
}

export type TagInfo = {
  tag: string
  count: number
  /** 用過這個標籤的代表性筆記標題 */
  samples: string[]
}

/** Jev 的 state 上限是 32k tokens，而且塞太多無關內容反而會拉低判定品質 */
const DEFAULT_EXCERPT_LIMIT = 2000
const DEFAULT_MAX_SAMPLES = 5

export function excerptOf(source: string, limit = DEFAULT_EXCERPT_LIMIT): string {
  const body = stripFrontmatter(source)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return body.length <= limit ? body : body.slice(0, limit)
}

function basename(path: string): string {
  const file = path.split('/').pop() ?? path
  return file.replace(/\.md$/i, '')
}

export function toNote(path: string, source: string): Note {
  return {
    path,
    title: readField(source, 'title') ?? basename(path),
    tags: readTags(source),
    excerpt: excerptOf(source),
  }
}

export type RawFile = { path: string; source: string }

export type SkipCounts = {
  /** 是 markdown 但沒有 frontmatter */
  noFrontmatter: number
  /** 根本不是 .md */
  notMarkdown: number
}

export type CollectResult = {
  notes: Note[]
  skipped: SkipCounts
}

const MARKDOWN = /\.md$/i

/**
 * 只有副檔名是 .md 而且帶 frontmatter 的檔案才會被納入。
 *
 * 沒有 frontmatter 的筆記代表使用者還沒有用這套 metadata，替它憑空生一段出來
 * 是在改變檔案的形態而不只是補標籤，所以一律跳過，並把數量回報給畫面。
 */
export function collectNotes(files: readonly RawFile[]): CollectResult {
  const notes: Note[] = []
  const skipped: SkipCounts = { noFrontmatter: 0, notMarkdown: 0 }

  for (const file of files) {
    if (!MARKDOWN.test(file.path)) {
      skipped.notMarkdown += 1
      continue
    }
    if (!hasFrontmatter(file.source)) {
      skipped.noFrontmatter += 1
      continue
    }
    notes.push(toNote(file.path, file.source))
  }

  return { notes, skipped }
}

export type TagDictionaryOptions = {
  /** 使用次數低於此值的零星標籤會被濾掉，通常是打錯字或一次性標籤 */
  minCount?: number
  maxSamples?: number
}

export function buildTagDictionary(
  notes: readonly Note[],
  options: TagDictionaryOptions = {},
): TagInfo[] {
  const { minCount = 1, maxSamples = DEFAULT_MAX_SAMPLES } = options

  const counts = new Map<string, { count: number; samples: string[] }>()
  for (const note of notes) {
    for (const tag of note.tags) {
      const entry = counts.get(tag) ?? { count: 0, samples: [] }
      entry.count += 1
      if (entry.samples.length < maxSamples) entry.samples.push(note.title)
      counts.set(tag, entry)
    }
  }

  return [...counts.entries()]
    .filter(([, entry]) => entry.count >= minCount)
    .map(([tag, entry]) => ({ tag, count: entry.count, samples: entry.samples }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

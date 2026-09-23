import type { NoteDiff } from './diff'

/**
 * 把逐篇的差異換個角度：按標籤看這次會動到什麼。
 *
 * 逐篇的清單在上千篇時讀不完，但「投資這個標籤要加到 6 篇」是一眼能判斷合不合理的
 * 尺度，按下寫入之前知道自己在做什麼。
 */

export type ChangeKind = 'add' | 'remove'

export type TagChange = {
  tag: string
  kind: ChangeKind
  count: number
  /** 代表性筆記標題，讓人認得出是哪幾篇 */
  samples: string[]
}

const DEFAULT_MAX_SAMPLES = 4

export function groupChanges(
  diffs: readonly NoteDiff[],
  titleByPath: ReadonlyMap<string, string>,
  options: { maxSamples?: number } = {},
): TagChange[] {
  const { maxSamples = DEFAULT_MAX_SAMPLES } = options
  const groups = new Map<string, TagChange>()

  const record = (tag: string, kind: ChangeKind, path: string) => {
    const key = `${kind}:${tag}`
    const group = groups.get(key) ?? { tag, kind, count: 0, samples: [] }
    group.count += 1
    if (group.samples.length < maxSamples) group.samples.push(titleByPath.get(path) ?? path)
    groups.set(key, group)
  }

  for (const diff of diffs) {
    for (const tag of diff.added) record(tag, 'add', diff.path)
    for (const tag of diff.removed) record(tag, 'remove', diff.path)
  }

  // 新增在前，移除在後，各自筆數多的排前面
  return [...groups.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'add' ? -1 : 1) ||
      b.count - a.count ||
      a.tag.localeCompare(b.tag),
  )
}

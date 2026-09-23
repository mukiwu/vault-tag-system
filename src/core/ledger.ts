import type { NoteDiff } from './diff'

/**
 * 套用紀錄。
 *
 * 快照負責的是把檔案整份還原，ledger 負責的是另一件事：記得每個標籤是誰加的，
 * 這樣之後要廢棄某一次判定時，可以只收回那一次動過的標籤，不去碰使用者後來
 * 自己改的東西。
 */

export type ApplyEntry = {
  path: string
  added: string[]
  removed: string[]
}

export type LedgerRun = {
  /** 與快照共用同一個 id */
  id: string
  at: string
  model?: string
  entries: ApplyEntry[]
}

export type Ledger = {
  version: 1
  runs: LedgerRun[]
}

export const LEDGER_VERSION = 1

export function emptyLedger(): Ledger {
  return { version: LEDGER_VERSION, runs: [] }
}

export function createRun(
  id: string,
  diffs: readonly NoteDiff[],
  meta: { model?: string; at?: string } = {},
): LedgerRun {
  const run: LedgerRun = {
    id,
    at: meta.at ?? new Date().toISOString(),
    entries: diffs.map((diff) => ({ path: diff.path, added: diff.added, removed: diff.removed })),
  }
  if (meta.model !== undefined) run.model = meta.model
  return run
}

/** 最新的排最前面，UI 直接照順序列出來就是由新到舊 */
export function recordRun(ledger: Ledger, run: LedgerRun): Ledger {
  return { ...ledger, runs: [run, ...ledger.runs] }
}

export function findRun(ledger: Ledger, id: string): LedgerRun | undefined {
  return ledger.runs.find((run) => run.id === id)
}

export function dropRun(ledger: Ledger, id: string): Ledger {
  return { ...ledger, runs: ledger.runs.filter((run) => run.id !== id) }
}

/**
 * 反向套用某一次對這篇筆記做的事：收回它加的、補回它刪的。
 * 使用者後來自己改的標籤不在這次紀錄裡，所以不會被動到。
 */
export function revertTags(currentTags: readonly string[], entry: ApplyEntry): string[] {
  const added = new Set(entry.added)
  const tags = currentTags.filter((tag) => !added.has(tag))
  for (const tag of entry.removed) {
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/** 這篇筆記上有哪些標籤是這個系統加的，用來在矩陣上標示來源 */
export function systemAddedTags(ledger: Ledger, path: string): Set<string> {
  const tags = new Set<string>()
  // runs 是新的在前，要照時間順序累積才能正確反映後來的移除
  for (const run of [...ledger.runs].reverse()) {
    for (const entry of run.entries) {
      if (entry.path !== path) continue
      for (const tag of entry.added) tags.add(tag)
      for (const tag of entry.removed) tags.delete(tag)
    }
  }
  return tags
}

/** ledger 壞掉不該讓整個工具打不開，讀不出來就當作沒有紀錄 */
export function parseLedger(source: string): Ledger {
  try {
    const parsed = JSON.parse(source) as Partial<Ledger>
    if (parsed?.version !== LEDGER_VERSION || !Array.isArray(parsed.runs)) return emptyLedger()
    return { version: LEDGER_VERSION, runs: parsed.runs }
  } catch {
    return emptyLedger()
  }
}

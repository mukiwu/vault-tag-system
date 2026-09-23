import type { NoteDiff } from './diff'
import { readTags, writeTags } from './frontmatter'
import { LEDGER_FILE, snapshotFile } from './io'
import type { VaultIO } from './io'
import {
  createRun,
  dropRun,
  emptyLedger,
  findRun,
  parseLedger,
  recordRun,
  revertTags,
} from './ledger'
import type { Ledger, LedgerRun } from './ledger'

/**
 * 寫回、廢棄、回滾。
 *
 * 這三個是唯一會真正動到使用者檔案的地方，所以順序上一律先留快照再寫檔，
 * 而且快照存的是整份原文，回滾就是把位元組寫回去，不依賴任何差異計算是否正確。
 */

export const SNAPSHOT_VERSION = 1

export type Snapshot = {
  version: number
  at: string
  files: Record<string, string>
}

export type ApplyFailure = { path: string; reason: string }

export type ApplyResult = {
  runId: string
  applied: number
  failures: ApplyFailure[]
}

export type ApplyOptions = {
  model?: string
  /** 只在測試裡指定，正常情況由時間加隨機碼產生 */
  runId?: string
  at?: string
}

const reasonOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

function newRunId(at: string): string {
  const stamp = at.replace(/[:.]/g, '-')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${suffix}`
}

async function loadLedger(io: VaultIO): Promise<Ledger> {
  const raw = await io.readMeta(LEDGER_FILE)
  return raw === null ? emptyLedger() : parseLedger(raw)
}

async function saveLedger(io: VaultIO, ledger: Ledger): Promise<void> {
  await io.writeMeta(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`)
}

/** 紀錄從 ledger 拿掉之後，快照就再也叫不出來了，順手清掉免得一直累積 */
async function discardSnapshot(io: VaultIO, runId: string): Promise<void> {
  try {
    await io.deleteMeta(snapshotFile(runId))
  } catch {
    // 清不掉只是留下一個沒人看得到的檔案，不值得讓整個操作失敗
  }
}

export async function applyDiffs(
  io: VaultIO,
  diffs: readonly NoteDiff[],
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  if (diffs.length === 0) return { runId: '', applied: 0, failures: [] }

  const at = options.at ?? new Date().toISOString()
  const runId = options.runId ?? newRunId(at)

  // 先把原文全部讀進來，讀不到的直接算失敗，不讓它進快照
  const files: Record<string, string> = {}
  const pending: { diff: NoteDiff; next: string }[] = []
  const failures: ApplyFailure[] = []

  for (const diff of diffs) {
    try {
      const original = await io.read(diff.path)
      files[diff.path] = original
      pending.push({ diff, next: writeTags(original, diff.nextTags) })
    } catch (cause) {
      failures.push({ path: diff.path, reason: reasonOf(cause) })
    }
  }

  const snapshot: Snapshot = { version: SNAPSHOT_VERSION, at, files }
  await io.writeMeta(snapshotFile(runId), `${JSON.stringify(snapshot, null, 2)}\n`)

  const done: NoteDiff[] = []
  for (const { diff, next } of pending) {
    try {
      await io.write(diff.path, next)
      done.push(diff)
    } catch (cause) {
      failures.push({ path: diff.path, reason: reasonOf(cause) })
    }
  }

  if (done.length > 0) {
    const ledger = await loadLedger(io)
    await saveLedger(io, recordRun(ledger, createRun(runId, done, { model: options.model, at })))
  }

  return { runId, applied: done.length, failures }
}

/**
 * 整份還原成快照當下的樣子。
 * 這會連使用者事後的修改一起蓋掉，是最徹底的一種復原。
 */
export async function rollback(io: VaultIO, runId: string): Promise<void> {
  const raw = await io.readMeta(snapshotFile(runId))
  if (raw === null) throw new Error(`找不到快照 ${runId}`)

  const snapshot = JSON.parse(raw) as Snapshot
  for (const [path, content] of Object.entries(snapshot.files)) {
    await io.write(path, content)
  }

  await saveLedger(io, dropRun(await loadLedger(io), runId))
  await discardSnapshot(io, runId)
}

/**
 * 只收回這一次動過的標籤，其餘一概不碰。
 * 使用者在這次套用之後自己改的內容會原樣保留，這是與回滾最大的差別。
 */
export async function revertRun(io: VaultIO, runId: string): Promise<void> {
  const ledger = await loadLedger(io)
  const run = findRun(ledger, runId)
  if (!run) throw new Error(`找不到套用紀錄 ${runId}`)

  for (const entry of run.entries) {
    const current = await io.read(entry.path)
    await io.write(entry.path, writeTags(current, revertTags(readTags(current), entry)))
  }

  await saveLedger(io, dropRun(ledger, runId))
  await discardSnapshot(io, runId)
}

/** 可以回滾或廢棄的紀錄，新的在前 */
export async function listSnapshots(io: VaultIO): Promise<LedgerRun[]> {
  return (await loadLedger(io)).runs
}

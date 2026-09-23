import { create } from 'zustand'
import { applyDiffs, listSnapshots, revertRun, rollback } from './core/apply'
import { DEFAULT_THRESHOLDS } from './core/decision'
import type { Thresholds } from './core/decision'
import { planNoteDiff } from './core/diff'
import type { NoteDiff } from './core/diff'
import {
  applyVerdicts,
  carryOver,
  clearOverrides,
  createGrid,
  overrideBand,
  overrideColumn,
  rowCells,
  toggleCell,
} from './core/grid'
import type { Grid } from './core/grid'
import type { VaultIO } from './core/io'
import type { LedgerRun } from './core/ledger'
import { excludeFolders, folderTree } from './core/folders'
import type { FolderNode } from './core/folders'
import { buildTagDictionary, collectNotes } from './core/vault'
import type { Note, SkipCounts, TagInfo } from './core/vault'
import { mapWithConcurrency } from './jev/client'
import { runVault } from './jev/run'
import type { NoteVerdict, RunProgress } from './jev/run'
import { collectMarkdown, createVaultIO, ensurePermission, pickVault } from './fs/directory'
import {
  clearVaultHandle,
  loadApiKey,
  loadExcludedFolders,
  loadVaultHandle,
  saveApiKey,
  saveExcludedFolders,
  saveVaultHandle,
} from './fs/persist'

export type Phase = 'idle' | 'scanning' | 'ready' | 'judging' | 'applying'

export type ApplyOutcome = {
  applied: number
  failures: { path: string; reason: string }[]
}

type Store = {
  root: FileSystemDirectoryHandle | null
  io: VaultIO | null
  vaultName: string
  /** 掃描到的全部筆記，排除設定改變時從這份重算，不必重讀檔案 */
  allNotes: Note[]
  notes: Note[]
  /** 資料夾樹，供排除用 */
  folders: FolderNode[]
  excludedFolders: string[]
  /** 掃描時被跳過的檔案，只處理 .md 且帶 frontmatter 的 */
  skipped: SkipCounts
  tags: TagInfo[]
  grid: Grid | null
  /** grid 是就地更新的，改動後靠這個數字觸發矩陣重繪 */
  revision: number
  /** 統計、待寫入、分布圖用的節奏，判定進行中刻意比 revision 慢 */
  statsRevision: number
  thresholds: Thresholds
  /** 使用次數低於此值的零星標籤不納入判定 */
  minTagCount: number
  model: string
  /** 使用者填的 Jev 金鑰，存在瀏覽器本機 */
  apiKey: string
  phase: Phase
  progress: RunProgress | null
  runs: LedgerRun[]
  error: string | null
  lastApply: ApplyOutcome | null

  setApiKey: (key: string) => void
  openVault: () => Promise<void>
  restoreVault: () => Promise<void>
  closeVault: () => Promise<void>
  judge: () => Promise<void>
  cancelJudge: () => void
  setThresholds: (next: Partial<Thresholds>) => void
  setMinTagCount: (value: number) => void
  toggleFolder: (folder: string) => void
  setExcludedFolders: (folders: string[]) => void
  toggle: (row: number, column: number) => void
  decideColumn: (column: number, value: boolean) => void
  decideBand: (value: boolean) => void
  clearDecisions: () => void
  pendingDiffs: () => NoteDiff[]
  apply: () => Promise<void>
  rollbackTo: (runId: string) => Promise<void>
  revertTo: (runId: string) => Promise<void>
}

let abort: AbortController | null = null

/**
 * 統計、待寫入清單、分布圖都要掃過整張矩陣，一個中型 vault 就是幾十萬格，
 * 跟著每一幀重算會直接卡死。格子本身每幀都畫，這些數字慢一點沒關係。
 */
const STATS_INTERVAL_MS = 300

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

export const useStore = create<Store>()((set, get) => {
  /** 重新讀一次 vault，套用或回滾之後都要做，確保畫面與檔案一致 */
  async function scan(root: FileSystemDirectoryHandle, io: VaultIO) {
    set({ phase: 'scanning', error: null })

    const { files, others } = await collectMarkdown(root)
    const raw = await mapWithConcurrency(files, 16, async (file) => ({
      path: file.path,
      source: await (await file.handle.getFile()).text(),
    }))

    const { notes: allNotes, skipped } = collectNotes(raw)
    const runs = await listSnapshots(io)

    set({
      allNotes,
      folders: folderTree(allNotes),
      // 非 md 在檔案系統那層就擋掉了，這裡把它的數量補進來
      skipped: { ...skipped, notMarkdown: skipped.notMarkdown + others },
      runs,
    })
    rebuild()
    set({ phase: 'ready' })
  }

  /**
   * 從 allNotes 重新算出矩陣。
   * 排除資料夾或調整標籤門檻都走這裡，不必重讀檔案，已經跑出來的判定也會搬過去。
   */
  function rebuild() {
    const { allNotes, excludedFolders, minTagCount, grid: previous } = get()

    const notes = excludeFolders(allNotes, new Set(excludedFolders))
    const tags = buildTagDictionary(notes, { minCount: minTagCount })
    const grid = createGrid(
      notes,
      tags.map((tag) => tag.tag),
    )
    if (previous) carryOver(previous, grid)

    set({ notes, tags, grid })
    bump()
  }

  /** 只重畫矩陣，或連統計一起更新 */
  function bump(stats = true) {
    const { revision, statsRevision } = get()
    set({
      revision: revision + 1,
      statsRevision: stats ? statsRevision + 1 : statsRevision,
    })
  }

  async function attach(root: FileSystemDirectoryHandle) {
    const io = createVaultIO(root)
    set({ root, io, vaultName: root.name, excludedFolders: loadExcludedFolders(root.name) })
    await scan(root, io)
  }

  return {
    root: null,
    io: null,
    vaultName: '',
    allNotes: [],
    notes: [],
    folders: [],
    excludedFolders: [],
    skipped: { noFrontmatter: 0, notMarkdown: 0 },
    tags: [],
    grid: null,
    revision: 0,
    statsRevision: 0,
    thresholds: DEFAULT_THRESHOLDS,
    minTagCount: 2,
    model: 'jev-latest',
    apiKey: loadApiKey(),
    phase: 'idle',
    progress: null,
    runs: [],
    error: null,
    lastApply: null,

    setApiKey(key) {
      const trimmed = key.trim()
      saveApiKey(trimmed)
      set({ apiKey: trimmed, error: null })
    },

    async openVault() {
      try {
        const root = await pickVault()
        if (!(await ensurePermission(root))) throw new Error('沒有取得讀寫權限')
        await saveVaultHandle(root)
        await attach(root)
      } catch (cause) {
        // 使用者自己按取消不算錯誤
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        set({ error: message(cause), phase: 'idle' })
      }
    },

    async restoreVault() {
      try {
        const root = await loadVaultHandle()
        if (!root) return
        if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          // 沒有權限時不主動跳視窗，等使用者自己按，瀏覽器也只認手勢觸發的請求
          set({ root, vaultName: root.name })
          return
        }
        await attach(root)
      } catch (cause) {
        set({ error: message(cause) })
      }
    },

    async closeVault() {
      await clearVaultHandle()
      set({
        root: null,
        io: null,
        vaultName: '',
        allNotes: [],
        notes: [],
        folders: [],
        excludedFolders: [],
        skipped: { noFrontmatter: 0, notMarkdown: 0 },
        tags: [],
        grid: null,
        runs: [],
        phase: 'idle',
        progress: null,
        lastApply: null,
        error: null,
      })
    },

    async judge() {
      const { notes, tags, grid, model, apiKey } = get()

      // 沒有金鑰就不要送出去白跑一趟，這是最該先講清楚的事
      if (apiKey === '') {
        set({ error: '還沒有填 Jev API key，請在上方填入之後再開始判定' })
        return
      }

      if (!grid || tags.length === 0) return

      const controller = new AbortController()
      abort = controller
      set({ phase: 'judging', progress: null, error: null, lastApply: null })

      let buffer: NoteVerdict[] = []
      let frame = 0
      let lastStats = 0

      /** 把手上收到的判定畫上去，跟著螢幕刷新走，看起來才是連續長出來的 */
      const paint = () => {
        frame = 0
        if (buffer.length === 0) return

        // 中途若因為排除資料夾換過矩陣，一律套用到當下這張
        const current = get().grid
        if (current) applyVerdicts(current, buffer)
        buffer = []

        const now = Date.now()
        const withStats = now - lastStats >= STATS_INTERVAL_MS
        if (withStats) lastStats = now
        bump(withStats)
      }

      const schedule = () => {
        if (frame !== 0) return
        frame = requestAnimationFrame(paint)
      }

      const finish = () => {
        if (frame !== 0) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        if (buffer.length > 0) {
          const current = get().grid
          if (current) applyVerdicts(current, buffer)
          buffer = []
        }
        bump()
      }

      try {
        const result = await runVault(notes, tags, {
          apiKey,
          model,
          signal: controller.signal,
          onVerdict: (verdict) => {
            buffer.push(verdict)
            schedule()
          },
          onProgress: (progress) => set({ progress }),
        })

        finish()

        // 中途喊停時剩下的每篇都會以中止收場，那不是真的失敗
        const stopped = controller.signal.aborted
        set({
          phase: 'ready',
          error: !stopped && result.failed > 0 ? `有 ${result.failed} 篇筆記判定失敗` : null,
        })
      } catch (cause) {
        finish()
        set({ phase: 'ready', error: message(cause) })
      } finally {
        abort = null
      }
    },

    cancelJudge() {
      abort?.abort()
    },

    setThresholds(next) {
      set({ thresholds: { ...get().thresholds, ...next } })
    },

    setMinTagCount(value) {
      set({ minTagCount: value })
      if (get().allNotes.length > 0) rebuild()
    },

    toggleFolder(folder) {
      const current = get().excludedFolders
      get().setExcludedFolders(
        current.includes(folder)
          ? current.filter((one) => one !== folder)
          : [...current, folder],
      )
    },

    setExcludedFolders(folders) {
      set({ excludedFolders: folders })
      saveExcludedFolders(get().vaultName, folders)
      if (get().allNotes.length > 0) rebuild()
    },

    toggle(row, column) {
      const { grid } = get()
      if (!grid) return
      toggleCell(grid, row, column)
      bump()
    },

    decideColumn(column, value) {
      const { grid, thresholds } = get()
      if (!grid) return
      overrideColumn(grid, column, value, thresholds)
      bump()
    },

    decideBand(value) {
      const { grid, thresholds } = get()
      if (!grid) return
      overrideBand(grid, value, thresholds)
      bump()
    },

    clearDecisions() {
      const { grid } = get()
      if (!grid) return
      clearOverrides(grid)
      bump()
    },

    pendingDiffs() {
      const { grid, notes, thresholds } = get()
      if (!grid) return []

      const tags = grid.tags
      return notes
        .map((note, row) => planNoteDiff(note, tags, rowCells(grid, row), thresholds))
        .filter((diff) => diff.changed)
    },

    async apply() {
      const { io, root, model } = get()
      if (!io || !root) return

      const diffs = get().pendingDiffs()
      if (diffs.length === 0) return

      set({ phase: 'applying', error: null })
      try {
        const result = await applyDiffs(io, diffs, { model })
        set({ lastApply: { applied: result.applied, failures: result.failures } })
        await scan(root, io)
      } catch (cause) {
        set({ phase: 'ready', error: message(cause) })
      }
    },

    async rollbackTo(runId) {
      const { io, root } = get()
      if (!io || !root) return

      set({ phase: 'applying', error: null })
      try {
        await rollback(io, runId)
        await scan(root, io)
      } catch (cause) {
        set({ phase: 'ready', error: message(cause) })
      }
    },

    async revertTo(runId) {
      const { io, root } = get()
      if (!io || !root) return

      set({ phase: 'applying', error: null })
      try {
        await revertRun(io, runId)
        await scan(root, io)
      } catch (cause) {
        set({ phase: 'ready', error: message(cause) })
      }
    },
  }
})

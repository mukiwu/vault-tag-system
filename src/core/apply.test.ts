import { describe, expect, it } from 'vitest'
import { applyDiffs, listSnapshots, revertRun, rollback } from './apply'
import type { VaultIO } from './io'
import { LEDGER_FILE, snapshotFile } from './io'
import { parseLedger } from './ledger'
import type { NoteDiff } from './diff'

/** 記憶體版的 vault，讓破壞性操作可以完整驗證 */
function memoryVault(files: Record<string, string>) {
  const notes = new Map(Object.entries(files))
  const meta = new Map<string, string>()

  const io: VaultIO = {
    async read(path) {
      const content = notes.get(path)
      if (content === undefined) throw new Error(`找不到 ${path}`)
      return content
    },
    async write(path, content) {
      notes.set(path, content)
    },
    async readMeta(path) {
      return meta.get(path) ?? null
    },
    async writeMeta(path, content) {
      meta.set(path, content)
    },
    async deleteMeta(path) {
      meta.delete(path)
    },
  }

  return { io, notes, meta }
}

const diff = (path: string, added: string[], removed: string[], nextTags: string[]): NoteDiff => ({
  path,
  added,
  removed,
  nextTags,
  changed: true,
})

const NOTE = `---\ntitle: 測試\ntags:\n  - 投資\n---\n\n# 內文\n\n這段不能被動到\n`

describe('applyDiffs', () => {
  it('把標籤寫回筆記，內文不受影響', async () => {
    const vault = memoryVault({ 'a.md': NOTE })

    await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    expect(vault.notes.get('a.md')).toBe(
      `---\ntitle: 測試\ntags:\n  - 投資\n  - 讀書筆記\n---\n\n# 內文\n\n這段不能被動到\n`,
    )
  })

  it('寫入前先留下快照，內容是動手前的原文', async () => {
    const vault = memoryVault({ 'a.md': NOTE })

    const result = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    const snapshot = JSON.parse(vault.meta.get(snapshotFile(result.runId)) as string)
    expect(snapshot.files['a.md']).toBe(NOTE)
  })

  it('記一筆 ledger，寫下這次動了哪些標籤', async () => {
    const vault = memoryVault({ 'a.md': NOTE })

    const result = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])], {
      model: 'jev-1.13.0',
    })

    const ledger = parseLedger(vault.meta.get(LEDGER_FILE) as string)
    expect(ledger.runs).toHaveLength(1)
    expect(ledger.runs[0]).toMatchObject({
      id: result.runId,
      model: 'jev-1.13.0',
      entries: [{ path: 'a.md', added: ['讀書筆記'], removed: [] }],
    })
  })

  it('沒有變動時不留快照也不寫 ledger', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const result = await applyDiffs(vault.io, [])

    expect(result.applied).toBe(0)
    expect(vault.meta.size).toBe(0)
  })

  it('某篇寫入失敗時，其他篇照樣完成並回報失敗清單', async () => {
    const vault = memoryVault({ 'a.md': NOTE, 'locked.md': NOTE })
    const io: VaultIO = {
      ...vault.io,
      async write(path, content) {
        if (path === 'locked.md') throw new Error('寫不進去')
        return vault.io.write(path, content)
      },
    }

    const result = await applyDiffs(io, [
      diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記']),
      diff('locked.md', ['投資'], [], ['投資']),
    ])

    expect(result.applied).toBe(1)
    expect(result.failures).toEqual([{ path: 'locked.md', reason: '寫不進去' }])
    expect(vault.notes.get('a.md')).toContain('讀書筆記')
  })

  it('讀不到的筆記直接跳過，不會把它寫進快照', async () => {
    const vault = memoryVault({ 'a.md': NOTE })

    const result = await applyDiffs(vault.io, [
      diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記']),
      diff('missing.md', ['投資'], [], ['投資']),
    ])

    expect(result.applied).toBe(1)
    expect(result.failures[0].path).toBe('missing.md')
    const snapshot = JSON.parse(vault.meta.get(snapshotFile(result.runId)) as string)
    expect(Object.keys(snapshot.files)).toEqual(['a.md'])
  })
})

describe('rollback', () => {
  it('把檔案整份還原成快照當下的樣子', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    await rollback(vault.io, runId)

    expect(vault.notes.get('a.md')).toBe(NOTE)
  })

  it('回滾之後這次紀錄就從 ledger 消失', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    await rollback(vault.io, runId)

    expect(parseLedger(vault.meta.get(LEDGER_FILE) as string).runs).toHaveLength(0)
  })

  it('回滾之後把用過的快照清掉，不留孤兒檔', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    await rollback(vault.io, runId)

    expect(vault.meta.has(snapshotFile(runId))).toBe(false)
  })

  it('快照不見時明確報錯，不要默默什麼都沒做', async () => {
    const vault = memoryVault({})
    await expect(rollback(vault.io, 'nope')).rejects.toThrow()
  })
})

describe('revertRun', () => {
  it('只收回這次加的標籤，使用者後來改的內文保留下來', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    // 使用者事後自己動了這篇筆記
    const edited = (vault.notes.get('a.md') as string).replace('這段不能被動到', '後來補寫的內容')
    await vault.io.write('a.md', edited)

    await revertRun(vault.io, runId)

    const after = vault.notes.get('a.md') as string
    expect(after).toContain('後來補寫的內容')
    expect(after).not.toContain('讀書筆記')
    expect(after).toContain('投資')
  })

  it('廢棄之後這次紀錄也從 ledger 消失', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    await revertRun(vault.io, runId)

    expect(parseLedger(vault.meta.get(LEDGER_FILE) as string).runs).toHaveLength(0)
  })

  it('廢棄之後快照也一起清掉', async () => {
    const vault = memoryVault({ 'a.md': NOTE })
    const { runId } = await applyDiffs(vault.io, [diff('a.md', ['讀書筆記'], [], ['投資', '讀書筆記'])])

    await revertRun(vault.io, runId)

    expect(vault.meta.has(snapshotFile(runId))).toBe(false)
  })

  it('找不到紀錄時明確報錯', async () => {
    const vault = memoryVault({})
    await expect(revertRun(vault.io, 'nope')).rejects.toThrow()
  })
})

describe('listSnapshots', () => {
  it('列出可回滾的紀錄，新的在前', async () => {
    const vault = memoryVault({ 'a.md': NOTE, 'b.md': NOTE })

    await applyDiffs(vault.io, [diff('a.md', ['甲'], [], ['投資', '甲'])])
    await applyDiffs(vault.io, [diff('b.md', ['乙'], [], ['投資', '乙'])])

    const runs = await listSnapshots(vault.io)
    expect(runs).toHaveLength(2)
    expect(runs[0].entries[0].path).toBe('b.md')
  })
})

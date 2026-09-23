/**
 * 端到端煙霧測試：對 fixtures/demo-vault 跑完整流程，並且真的打 Jev。
 *
 * 選資料夾那一步是瀏覽器的原生對話框沒辦法自動化，所以這支腳本把 File System
 * Access API 換成 Node 的 fs，其餘走的都是正式程式碼，用來確認判定品質、成本，
 * 以及寫入和回滾是否真的正確。
 *
 *   npx tsx scripts/smoke.ts [vault 路徑]
 */

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { applyDiffs, listSnapshots, revertRun, rollback } from '../src/core/apply'
import { DEFAULT_THRESHOLDS } from '../src/core/decision'
import { planNoteDiff } from '../src/core/diff'
import { applyVerdicts, cellAt, createGrid, summarize } from '../src/core/grid'
import { META_DIR } from '../src/core/io'
import type { VaultIO } from '../src/core/io'
import { buildTagDictionary, collectNotes } from '../src/core/vault'
import { runVault } from '../src/jev/run'
import type { JevRequest, JevResponse } from '../src/jev/types'

const VAULT = process.argv[2] ?? join(import.meta.dirname, '..', 'fixtures', 'demo-vault')
const API_KEY = process.env.TYPESAFE_API_KEY
const MODEL = process.env.JEV_MODEL ?? 'jev-latest'

const nodeIO = (root: string): VaultIO => ({
  read: (path) => readFile(join(root, path), 'utf8'),
  write: (path, content) => writeFile(join(root, path), content, 'utf8'),
  async readMeta(path) {
    try {
      return await readFile(join(root, META_DIR, path), 'utf8')
    } catch {
      return null
    }
  },
  async writeMeta(path, content) {
    const target = join(root, META_DIR, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  },
  deleteMeta: (path) => rm(join(root, META_DIR, path), { force: true }),
})

async function markdownFiles(dir: string, root = dir): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await markdownFiles(full, root)))
    else if (entry.name.endsWith('.md')) found.push(relative(root, full))
  }
  return found.sort()
}

/** 直接打 Jev，dev server 的 proxy 在這裡用不到，所以自己補上 header */
async function ask(request: JevRequest): Promise<JevResponse> {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...request, model: MODEL }),
  })

  if (!response.ok) {
    throw new Error(`Jev 回應 ${response.status}：${await response.text()}`)
  }
  return (await response.json()) as JevResponse
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 TYPESAFE_API_KEY，請先在 .env.local 填好再跑')
    process.exit(1)
  }

  const io = nodeIO(VAULT)
  const paths = await markdownFiles(VAULT)
  const raw = await Promise.all(
    paths.map(async (path) => ({ path, source: await io.read(path) })),
  )
  const { notes, skipped } = collectNotes(raw)
  const tags = buildTagDictionary(notes, { minCount: 1 })

  console.log(`vault：${VAULT}`)
  console.log(`筆記 ${notes.length} 篇，標籤 ${tags.length} 個`)
  if (skipped.noFrontmatter > 0 || skipped.notMarkdown > 0) {
    console.log(
      `跳過 ${skipped.noFrontmatter} 篇沒有 frontmatter，${skipped.notMarkdown} 個非 markdown`,
    )
  }
  console.log(tags.map((t) => `${t.tag}(${t.count})`).join('  '))

  const grid = createGrid(notes, tags.map((t) => t.tag))

  console.log('\n開始判定')
  const started = Date.now()
  const result = await runVault(notes, tags, {
    ask,
    concurrency: 4,
    onProgress: (p) => process.stdout.write(`\r  ${p.done}/${p.total}`),
  })
  const elapsed = Date.now() - started

  applyVerdicts(grid, result.verdicts)

  const cost = (result.inputTokens * 0.042) / 1_000_000
  console.log(
    `\n  耗時 ${(elapsed / 1000).toFixed(1)}s　input tokens ${result.inputTokens}　約 $${cost.toFixed(4)}　失敗 ${result.failed}`,
  )

  console.log('\n判定結果（每格是機率，方括號代表原本就有這個標籤）')
  const width = Math.max(...tags.map((t) => t.tag.length)) * 2 + 2
  console.log(''.padEnd(34) + tags.map((t) => t.tag.padEnd(width)).join(''))
  notes.forEach((note, row) => {
    const cells = tags.map((_, column) => {
      const cell = cellAt(grid, row, column)
      const score = cell.noul === undefined ? '  -  ' : cell.noul.toFixed(2)
      return (cell.original ? `[${score}]` : ` ${score} `).padEnd(width)
    })
    console.log(note.title.slice(0, 16).padEnd(30) + cells.join(''))
  })

  const counts = summarize(grid, DEFAULT_THRESHOLDS)
  console.log(
    `\n門檻 ${DEFAULT_THRESHOLDS.auto} / ${DEFAULT_THRESHOLDS.review}　` +
      `自動加上 ${counts.add}　待審 ${counts.review}　建議廢棄 ${counts['suggest-drop']}　維持 ${counts.keep}`,
  )

  const tagNames = tags.map((t) => t.tag)
  const diffs = notes
    .map((note, row) => {
      const cells = new Map(tagNames.map((tag, column) => [tag, cellAt(grid, row, column)]))
      return planNoteDiff(note, tagNames, cells, DEFAULT_THRESHOLDS)
    })
    .filter((d) => d.changed)

  console.log(`\n待寫入 ${diffs.length} 篇`)
  for (const diff of diffs) {
    console.log(
      `  ${diff.path}　加 [${diff.added.join(', ')}]${diff.removed.length ? `　減 [${diff.removed.join(', ')}]` : ''}`,
    )
  }

  if (diffs.length === 0) {
    console.log('\n沒有變動，略過寫入與回滾驗證')
    return
  }

  const before = new Map(raw.map((f) => [f.path, f.source] as const))

  console.log('\n寫入')
  const applied = await applyDiffs(io, diffs, { model: MODEL })
  console.log(`  已寫入 ${applied.applied} 篇，失敗 ${applied.failures.length}`)

  const sample = diffs[0].path
  console.log(`\n${sample} 寫入後：`)
  console.log(
    (await io.read(sample))
      .split('\n')
      .slice(0, 10)
      .map((line) => `  │ ${line}`)
      .join('\n'),
  )

  console.log('\n廢棄標籤（只收回這次加的）')
  await revertRun(io, applied.runId)

  console.log('  比對是否回到原狀')
  let mismatched = 0
  for (const path of paths) {
    const now = await io.read(path)
    if (now !== before.get(path)) {
      mismatched += 1
      console.log(`  × ${path} 與原文不同`)
    }
  }
  console.log(mismatched === 0 ? '  ✓ 所有檔案都回到原狀' : `  × ${mismatched} 個檔案沒有回到原狀`)

  console.log('\n再寫一次，改用快照回滾')
  const second = await applyDiffs(io, diffs, { model: MODEL })
  await rollback(io, second.runId)

  let rollbackMismatch = 0
  for (const path of paths) {
    if ((await io.read(path)) !== before.get(path)) {
      rollbackMismatch += 1
      console.log(`  × ${path} 與原文不同`)
    }
  }
  console.log(
    rollbackMismatch === 0 ? '  ✓ 回滾後逐字元相同' : `  × ${rollbackMismatch} 個檔案沒有還原`,
  )

  console.log(`\n剩餘紀錄 ${(await listSnapshots(io)).length} 筆`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

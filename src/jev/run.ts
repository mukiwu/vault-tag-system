import type { Note, TagInfo } from '../core/vault'
import { askJev, mapWithConcurrency } from './client'
import { DEFAULT_BATCH_SIZE, buildQuestionSet, buildState, planBatches } from './questions'
import type { JevRequest, JevResponse } from './types'

/** 跑完整個 vault 的判定，一篇筆記一次請求，標籤全部平行評估 */

export type NoteVerdict = {
  path: string
  /** 每個標籤拿到的 0 到 1 機率 */
  noulByTag: Map<string, number>
  /** 這篇判定失敗時的原因 */
  error?: string
}

export type RunProgress = {
  done: number
  total: number
  inputTokens: number
  failed: number
}

export type RunResult = {
  verdicts: NoteVerdict[]
  inputTokens: number
  failed: number
}

type Ask = (
  request: JevRequest,
  options?: { apiKey?: string; model?: string; signal?: AbortSignal },
) => Promise<JevResponse>

export type RunOptions = {
  /** 使用者填的金鑰，會隨每個請求送到本機 proxy */
  apiKey?: string
  batchSize?: number
  /** rate limit 是每分鐘 1200 requests，預設值留了很大的餘裕 */
  concurrency?: number
  model?: string
  signal?: AbortSignal
  onProgress?: (progress: RunProgress) => void
  /** 每判定完一篇就回報，畫面可以邊跑邊長出來，不必等整批結束 */
  onVerdict?: (verdict: NoteVerdict) => void
  ask?: Ask
}

export async function runVault(
  notes: readonly Note[],
  tags: readonly TagInfo[],
  options: RunOptions = {},
): Promise<RunResult> {
  const {
    apiKey,
    batchSize = DEFAULT_BATCH_SIZE,
    concurrency = 4,
    model,
    signal,
    onProgress,
    onVerdict,
    ask = askJev as Ask,
  } = options

  if (tags.length === 0 || notes.length === 0) {
    return { verdicts: [], inputTokens: 0, failed: 0 }
  }

  // 問題集跟筆記無關，先建好給所有筆記共用
  const batches = planBatches(tags, batchSize).map(buildQuestionSet)

  let done = 0
  let inputTokens = 0
  let failed = 0

  const verdicts = await mapWithConcurrency(notes, concurrency, async (note) => {
    const noulByTag = new Map<string, number>()
    const state = buildState(note)
    let error: string | undefined

    for (const set of batches) {
      try {
        const response = await ask({ state, questions: set.questions }, { apiKey, model, signal })
        inputTokens += response.usage?.input_tokens ?? 0

        for (const [id, answer] of Object.entries(response.answers)) {
          const tag = set.tagById.get(id)
          if (tag !== undefined && typeof answer.noul === 'number') {
            noulByTag.set(tag, answer.noul)
          }
        }
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
        break
      }
    }

    done += 1
    if (error) failed += 1

    const verdict: NoteVerdict = { path: note.path, noulByTag, error }
    onVerdict?.(verdict)
    onProgress?.({ done, total: notes.length, inputTokens, failed })

    return verdict
  })

  return { verdicts, inputTokens, failed }
}

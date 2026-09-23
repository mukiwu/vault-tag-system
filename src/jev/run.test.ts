import { describe, expect, it, vi } from 'vitest'
import { runVault } from './run'
import type { JevRequest, JevResponse } from './types'
import type { Note, TagInfo } from '../core/vault'

const note = (path: string): Note => ({ path, title: path, tags: [], excerpt: '內文' })

const tagInfo = (name: string): TagInfo => ({ tag: name, count: 2, samples: ['範例'] })

/** 每題都回固定機率的假 Jev */
const fakeAsk = (value: number, usage = 100) =>
  vi.fn(async (request: JevRequest): Promise<JevResponse> => {
    const answers = Object.fromEntries(
      Object.keys(request.questions).map((id) => [id, { type: 'noul', noul: value }]),
    )
    return { model: 'jev-1.13.0', answers, usage: { input_tokens: usage, output_tokens: 0 } }
  })

describe('runVault', () => {
  const notes = [note('a.md'), note('b.md')]
  const tags = [tagInfo('投資'), tagInfo('讀書筆記')]

  it('把每題的機率對應回標籤', async () => {
    const result = await runVault(notes, tags, { ask: fakeAsk(0.93) })

    expect(result.verdicts).toHaveLength(2)
    expect(result.verdicts[0].path).toBe('a.md')
    expect([...result.verdicts[0].noulByTag.entries()]).toEqual([
      ['投資', 0.93],
      ['讀書筆記', 0.93],
    ])
  })

  it('每篇筆記一次請求，標籤數不影響請求數', async () => {
    const ask = fakeAsk(0.5)
    await runVault(notes, tags, { ask })
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('標籤超過批次上限時切批，答案會併回同一篇筆記', async () => {
    const many = Array.from({ length: 5 }, (_, i) => tagInfo(`標籤${i}`))
    const ask = fakeAsk(0.8)

    const result = await runVault([note('a.md')], many, { ask, batchSize: 2 })

    expect(ask).toHaveBeenCalledTimes(3)
    expect(result.verdicts[0].noulByTag.size).toBe(5)
  })

  it('回報進度與累計的 token 用量', async () => {
    const onProgress = vi.fn()
    const result = await runVault(notes, tags, { ask: fakeAsk(0.5, 250), onProgress })

    expect(onProgress).toHaveBeenCalled()
    const last = onProgress.mock.calls.at(-1)?.[0]
    expect(last).toMatchObject({ done: 2, total: 2, failed: 0 })
    expect(result.inputTokens).toBe(500)
  })

  it('單篇失敗不會拖垮整批，會記下錯誤', async () => {
    const ask = vi.fn(async (request: JevRequest) => {
      if (JSON.stringify(request.state).includes('b.md')) throw new Error('壞掉了')
      return fakeAsk(0.9)(request)
    })

    const result = await runVault(notes, tags, { ask })

    expect(result.verdicts[0].error).toBeUndefined()
    expect(result.verdicts[1].error).toContain('壞掉了')
    expect(result.failed).toBe(1)
  })

  it('每判定完一篇就回報一次，不必等整批跑完', async () => {
    const seen: string[] = []
    const result = await runVault(notes, tags, {
      ask: fakeAsk(0.93),
      onVerdict: (verdict) => seen.push(verdict.path),
    })

    expect(seen.sort()).toEqual(['a.md', 'b.md'])
    expect(result.verdicts).toHaveLength(2)
  })

  it('逐篇回報的內容就是那篇的判定值', async () => {
    const seen: number[] = []
    await runVault([note('a.md')], tags, {
      ask: fakeAsk(0.77),
      onVerdict: (verdict) => seen.push(...verdict.noulByTag.values()),
    })

    expect(seen).toEqual([0.77, 0.77])
  })

  it('失敗的那篇也會回報，帶著錯誤原因', async () => {
    const ask = vi.fn(async () => {
      throw new Error('壞掉了')
    })

    const seen: (string | undefined)[] = []
    await runVault([note('a.md')], tags, { ask, onVerdict: (v) => seen.push(v.error) })

    expect(seen).toEqual(['壞掉了'])
  })

  it('沒有標籤時不發任何請求', async () => {
    const ask = fakeAsk(0.9)
    const result = await runVault(notes, [], { ask })
    expect(ask).not.toHaveBeenCalled()
    expect(result.verdicts).toHaveLength(0)
  })
})

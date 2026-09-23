import { describe, expect, it, vi } from 'vitest'
import { JevError, askJev, mapWithConcurrency } from './client'
import type { JevRequest } from './types'

const request: JevRequest = {
  state: { content: '內文' },
  questions: { tag_0: { type: 'noul', instructions: '測試' } },
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const fail = (status: number) => new Response('nope', { status })

const answer = { model: 'jev-1.13.0', answers: { tag_0: { type: 'noul', noul: 0.93 } }, usage: {} }

describe('askJev', () => {
  it('回傳解析後的答案', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    const result = await askJev(request, { fetch: fetchMock })
    expect(result.answers.tag_0.noul).toBe(0.93)
  })

  it('打到自家的 proxy，不直接碰 Jev，因為 Jev 的 CORS 白名單沒有 localhost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/jev')
    expect(init.method).toBe('POST')
  })

  it('金鑰放在自訂標頭送給本機 proxy，不以 Authorization 直接外送', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock, apiKey: 'apikey_test' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['x-typesafe-key']).toBe('apikey_test')
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i)
  })

  it('沒有金鑰時不送出那個標頭', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock })
    expect(fetchMock.mock.calls[0][1].headers['x-typesafe-key']).toBeUndefined()
  })

  it('金鑰不會被寫進請求內容', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock, apiKey: 'apikey_secret' })
    expect(fetchMock.mock.calls[0][1].body).not.toContain('apikey_secret')
  })

  it('帶上指定的模型版本，避免判定隨模型更新而漂移', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock, model: 'jev-1.13.0' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('jev-1.13.0')
  })

  it('沒有指定模型時也一定要帶，因為 model 是必填欄位', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(answer))
    await askJev(request, { fetch: fetchMock })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBeTruthy()
  })

  it('遇到限流會退避重試，最後成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(529))
      .mockResolvedValue(ok(answer))

    const result = await askJev(request, { fetch: fetchMock, retryDelay: () => 0 })
    expect(result.answers.tag_0.noul).toBe(0.93)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('重試用完還是失敗就丟錯', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(429))
    await expect(
      askJev(request, { fetch: fetchMock, retryDelay: () => 0, maxRetries: 2 }),
    ).rejects.toBeInstanceOf(JevError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('金鑰或請求格式錯誤不重試，直接丟出來', async () => {
    for (const status of [401, 403, 422]) {
      const fetchMock = vi.fn().mockResolvedValue(fail(status))
      await expect(askJev(request, { fetch: fetchMock, retryDelay: () => 0 })).rejects.toMatchObject({
        status,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('403 要引導去填金鑰，而不是說金鑰錯', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { error_type: 'authentication_error', message: 'Must supply an API key!' },
        }),
        { status: 403 },
      ),
    )

    await expect(askJev(request, { fetch: fetchMock })).rejects.toThrow(/沒有收到 API key/)
  })

  it('401 要指向金鑰本身無效', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(401))
    await expect(askJev(request, { fetch: fetchMock })).rejects.toThrow(/金鑰/)
  })

  it('把伺服器回的說明帶進錯誤訊息，方便直接看懂', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: [{ msg: 'Field required', loc: ['body', 'model'] }] }), {
        status: 422,
      }),
    )

    await expect(askJev(request, { fetch: fetchMock })).rejects.toThrow(/Field required/)
  })
})

describe('mapWithConcurrency', () => {
  it('保持輸入順序回傳結果', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2)
    expect(out).toEqual([2, 4, 6, 8, 10])
  })

  it('同時在跑的數量不超過上限', async () => {
    let running = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
    })
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('沒有輸入時直接回空陣列', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})

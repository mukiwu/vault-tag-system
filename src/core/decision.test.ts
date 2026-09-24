import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, band, desiredTags, isPending, nextOverride, status } from './decision'
import type { Cell } from './decision'

const T = DEFAULT_THRESHOLDS // { auto: 0.9, review: 0.4 }

const cell = (over: Partial<Cell> = {}): Cell => ({ original: false, ...over })

describe('band', () => {
  it('高於自動門檻算 auto', () => {
    expect(band(0.97, T)).toBe('auto')
    expect(band(0.9, T)).toBe('auto')
  })

  it('落在兩個門檻之間算 review', () => {
    expect(band(0.89, T)).toBe('review')
    expect(band(0.4, T)).toBe('review')
  })

  it('低於審核門檻算 reject', () => {
    expect(band(0.39, T)).toBe('reject')
    expect(band(0.02, T)).toBe('reject')
  })

  it('門檻可調，同一個值會換組別', () => {
    expect(band(0.75, { auto: 0.7, review: 0.3 })).toBe('auto')
    expect(band(0.75, { auto: 0.95, review: 0.3 })).toBe('review')
  })
})

describe('status', () => {
  it('還沒判定時維持原狀', () => {
    expect(status(cell({ original: true }), T)).toBe('keep')
    expect(status(cell({ original: false }), T)).toBe('none')
  })

  it('原本沒有而信心高時自動加上', () => {
    expect(status(cell({ noul: 0.96 }), T)).toBe('add')
  })

  it('原本沒有而信心中等時等人審核', () => {
    expect(status(cell({ noul: 0.6 }), T)).toBe('review')
  })

  it('原本沒有而信心低時不動作', () => {
    expect(status(cell({ noul: 0.1 }), T)).toBe('none')
  })

  it('原本有而 AI 也同意時維持', () => {
    expect(status(cell({ original: true, noul: 0.95 }), T)).toBe('keep')
    expect(status(cell({ original: true, noul: 0.6 }), T)).toBe('keep')
  })

  it('原本有但 AI 認為不該有時，只提出建議而不自動移除', () => {
    expect(status(cell({ original: true, noul: 0.05 }), T)).toBe('suggest-drop')
  })

  it('人工採納優先於任何判定', () => {
    expect(status(cell({ noul: 0.05, override: true }), T)).toBe('manual-add')
    expect(status(cell({ original: true, noul: 0.99, override: false }), T)).toBe('drop')
  })

  it('人工的決定與原狀相同時不算變動', () => {
    expect(status(cell({ original: true, override: true }), T)).toBe('keep')
    expect(status(cell({ original: false, override: false }), T)).toBe('none')
  })
})

describe('isPending', () => {
  it('只有等人決定的格子算待審', () => {
    expect(isPending(cell({ noul: 0.6 }), T)).toBe(true)
    expect(isPending(cell({ original: true, noul: 0.05 }), T)).toBe(true)
  })

  it('已經有人工決定的格子不再待審', () => {
    expect(isPending(cell({ noul: 0.6, override: true }), T)).toBe(false)
    expect(isPending(cell({ noul: 0.6, override: false }), T)).toBe(false)
  })

  it('自動採納與不動作的格子不算待審', () => {
    expect(isPending(cell({ noul: 0.96 }), T)).toBe(false)
    expect(isPending(cell({ noul: 0.1 }), T)).toBe(false)
    expect(isPending(cell({ original: true, noul: 0.95 }), T)).toBe(false)
  })
})

describe('desiredTags', () => {
  it('算出一篇筆記套用後應該有的標籤，並保持標籤順序', () => {
    const cells = new Map<string, Cell>([
      ['投資', { original: true, noul: 0.99 }],
      ['讀書筆記', { original: false, noul: 0.96 }],
      ['待辦', { original: false, noul: 0.6 }],
      ['食譜', { original: false, noul: 0.02 }],
      ['舊標籤', { original: true, noul: 0.03 }],
    ])
    expect(desiredTags(['投資', '讀書筆記', '待辦', '食譜', '舊標籤'], cells, T)).toEqual([
      '投資',
      '讀書筆記',
      '舊標籤',
    ])
  })

  it('人工決定會反映在結果裡', () => {
    const cells = new Map<string, Cell>([
      ['待辦', { original: false, noul: 0.6, override: true }],
      ['舊標籤', { original: true, noul: 0.03, override: false }],
    ])
    expect(desiredTags(['待辦', '舊標籤'], cells, T)).toEqual(['待辦'])
  })

  it('沒有對應格子的標籤視為維持原狀', () => {
    expect(desiredTags(['投資'], new Map(), T)).toEqual([])
  })
})

describe('nextOverride', () => {
  /** 從未決定開始連點三下，每一下之後的 override */
  const cycle = (start: Cell) => {
    const seen: (boolean | undefined)[] = []
    let current = start
    for (let i = 0; i < 3; i += 1) {
      const next = nextOverride(current, T)
      seen.push(next)
      current = { ...current, override: next }
    }
    return seen
  }

  it('建議廢棄的第一下就是照建議移除，再來保留，第三下回到未決定', () => {
    expect(cycle(cell({ original: true, noul: 0.05 }))).toEqual([false, true, undefined])
  })

  it('待審核的第一下是採納，再來退回，第三下回到未決定', () => {
    expect(cycle(cell({ noul: 0.6 }))).toEqual([true, false, undefined])
  })

  it('已經自動決定的格子，第一下就是翻轉結果', () => {
    expect(cycle(cell({ noul: 0.96 }))).toEqual([false, true, undefined])
    expect(cycle(cell({ original: true, noul: 0.95 }))).toEqual([false, true, undefined])
    expect(cycle(cell({ noul: 0.05 }))).toEqual([true, false, undefined])
  })

  it('還沒判定的格子照原本有沒有來翻', () => {
    expect(nextOverride(cell({ original: true }), T)).toBe(false)
    expect(nextOverride(cell(), T)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../core/decision'
import type { Cell } from '../core/decision'
import { KEEP, WARN, nodeStyle, ramp } from './palette'

const T = DEFAULT_THRESHOLDS
const cell = (over: Partial<Cell> = {}): Cell => ({ original: false, ...over })
const style = (over: Partial<Cell> = {}) => nodeStyle(cell(over), T)

describe('ramp', () => {
  it('兩端與中間都給得出顏色', () => {
    for (const t of [0, 0.5, 1]) {
      expect(ramp(t)).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/)
    }
  })

  it('超出範圍的值要收進兩端，不能算出無效顏色', () => {
    expect(ramp(-1)).toBe(ramp(0))
    expect(ramp(2)).toBe(ramp(1))
  })

  it('信心越高顏色越亮，掃視時看得出強弱', () => {
    const lum = (c: string) => c.match(/\d+/g)!.reduce((sum, v) => sum + Number(v), 0)
    expect(lum(ramp(0.95))).toBeGreaterThan(lum(ramp(0.5)))
    expect(lum(ramp(0.5))).toBeGreaterThan(lum(ramp(0.05)))
  })
})

describe('nodeStyle', () => {
  it('原有的標籤畫成方框，空心', () => {
    const s = style({ original: true, noul: 0.95 })
    expect(s.radius).toBe('0')
    expect(s.fill).toBe('transparent')
  })

  it('還沒判定的原有標籤一樣是方框', () => {
    expect(style({ original: true }).radius).toBe('0')
  })

  it('自動加上的畫成實心圓', () => {
    const s = style({ noul: 0.96 })
    expect(s.radius).toBe('50%')
    expect(s.fill).not.toBe('transparent')
  })

  it('待審的畫成虛線圓，空心', () => {
    const s = style({ noul: 0.6 })
    expect(s.radius).toBe('50%')
    expect(s.fill).toBe('transparent')
    expect(s.border).toContain('dashed')
  })

  it('建議廢棄的用警示色實心方塊', () => {
    const s = style({ original: true, noul: 0.05 })
    expect(s.radius).toBe('0')
    expect(s.fill).toBe(WARN)
  })

  it('人工移除畫成空心方框加叉，跟還沒決定的建議廢棄分得開', () => {
    const suggested = style({ original: true, noul: 0.05 })
    const dropped = style({ original: true, noul: 0.05, override: false })
    expect(dropped.fill).toBe('transparent')
    expect(dropped.border).toContain(WARN)
    expect(dropped.cross).toBe(true)
    expect(suggested.cross).toBe(false)
  })

  it('人工決定過的加一圈外環，跟自動判定分得開', () => {
    expect(style({ noul: 0.6, override: true }).ring).not.toBe('none')
    expect(style({ original: true, noul: 0.95, override: false }).ring).not.toBe('none')
    expect(style({ noul: 0.96 }).ring).toBe('none')
  })

  it('信心越高結點越大', () => {
    const px = (s: string) => Number.parseInt(s, 10)
    expect(px(style({ noul: 0.98 }).size)).toBeGreaterThan(px(style({ noul: 0.2 }).size))
  })

  it('每種狀態都帶一句說明，供輔助技術朗讀', () => {
    for (const c of [{ noul: 0.96 }, { noul: 0.6 }, { original: true }, { original: true, noul: 0.02 }]) {
      expect(nodeStyle(cell(c), T).label.length).toBeGreaterThan(0)
    }
  })
})

describe('冷暖分工', () => {
  const th = { auto: 0.9, review: 0.4 }

  it('原有維持用中性色，不跟著信心色階走', () => {
    // 跟著色階走的話，既有標籤會跟 AI 判出來的混在同一個色系
    const keep = nodeStyle({ original: true, noul: 0.95 }, th)
    expect(keep.border).toContain(KEEP)
    expect(keep.border).not.toContain(ramp(0.95))
  })

  it('建議廢棄是矩陣上唯一的冷色', () => {
    const drop = nodeStyle({ original: true, noul: 0.05 }, th)
    expect(drop.fill).toBe(WARN)
    // 色階整段都是暖色，警示才是藍的
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(ramp(t)).not.toBe(WARN)
    }
  })

  it('自動加上跟著色階走到最亮那一端', () => {
    const add = nodeStyle({ original: false, noul: 0.96 }, th)
    expect(add.fill).toBe(ramp(0.96))
  })
})

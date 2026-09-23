import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../core/decision'
import type { Cell } from '../core/decision'
import { WARN, nodeStyle, ramp } from './palette'

const T = DEFAULT_THRESHOLDS
const cell = (over: Partial<Cell> = {}): Cell => ({ original: false, ...over })
const style = (over: Partial<Cell> = {}) => nodeStyle(cell(over), T)

describe('ramp', () => {
  it('兩端與中間都給得出顏色', () => {
    for (const t of [0, 0.5, 1]) {
      expect(ramp(t)).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
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

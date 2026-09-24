import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../core/decision'
import type { Cell } from '../core/decision'
import { describeCell } from './describe'

const T = DEFAULT_THRESHOLDS
const cell = (over: Partial<Cell> = {}): Cell => ({ original: false, ...over })
const read = (over: Partial<Cell> = {}) => describeCell(cell(over), T)

describe('describeCell', () => {
  it('建議廢棄還沒決定時，寫入會保留，點一下會移除', () => {
    expect(read({ original: true, noul: 0.05 })).toMatchObject({
      label: '建議廢棄',
      outcome: '保留',
      next: '移除這個標籤',
    })
  })

  it('移除之後，寫入會移除，再點一下改成保留', () => {
    expect(read({ original: true, noul: 0.05, override: false })).toMatchObject({
      label: '人工移除',
      outcome: '移除',
      next: '保留這個標籤',
    })
  })

  it('保留之後，再點一下回到未決定，並說出那時寫入的結果', () => {
    expect(read({ original: true, noul: 0.05, override: true })).toMatchObject({
      label: '人工保留',
      outcome: '保留',
      next: '回到未決定，寫入時保留',
    })
  })

  it('待審核還沒決定時，寫入不會加，點一下會加上', () => {
    expect(read({ noul: 0.6 })).toMatchObject({
      label: '待審核',
      outcome: '不加',
      next: '加上這個標籤',
    })
  })

  it('人工退回的待審核跟兩邊都不要的格子說法分開', () => {
    expect(read({ noul: 0.6, override: false }).label).toBe('人工退回')
    expect(read({ noul: 0.05 }).label).toBe('不加')
  })

  it('有判定值就附上信心，沒有就說還沒判定', () => {
    expect(read({ noul: 0.6 }).score).toBe('信心 0.60')
    expect(read({ original: true }).score).toBe('未判定')
  })
})

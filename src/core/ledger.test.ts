import { describe, expect, it } from 'vitest'
import {
  createRun,
  dropRun,
  emptyLedger,
  findRun,
  parseLedger,
  recordRun,
  revertTags,
  systemAddedTags,
} from './ledger'

const run = (id: string, entries: { path: string; added?: string[]; removed?: string[] }[]) => ({
  id,
  at: '2026-09-22T00:00:00.000Z',
  entries: entries.map((e) => ({ path: e.path, added: e.added ?? [], removed: e.removed ?? [] })),
})

describe('createRun', () => {
  it('從差異清單建立一筆套用紀錄', () => {
    const created = createRun(
      'snap-1',
      [{ path: 'a.md', added: ['投資'], removed: [], nextTags: ['投資'], changed: true }],
      { model: 'jev-1.13.0', at: '2026-09-22T00:00:00.000Z' },
    )
    expect(created).toEqual({
      id: 'snap-1',
      at: '2026-09-22T00:00:00.000Z',
      model: 'jev-1.13.0',
      entries: [{ path: 'a.md', added: ['投資'], removed: [] }],
    })
  })
})

describe('recordRun', () => {
  it('加進 ledger 而不動到原本的物件', () => {
    const before = emptyLedger()
    const after = recordRun(before, run('snap-1', [{ path: 'a.md', added: ['投資'] }]))
    expect(before.runs).toHaveLength(0)
    expect(after.runs).toHaveLength(1)
  })

  it('最新的紀錄排在最前面', () => {
    let ledger = emptyLedger()
    ledger = recordRun(ledger, run('snap-1', []))
    ledger = recordRun(ledger, run('snap-2', []))
    expect(ledger.runs.map((r) => r.id)).toEqual(['snap-2', 'snap-1'])
  })
})

describe('revertTags', () => {
  it('把這次加上的標籤收回去', () => {
    const tags = revertTags(['投資', '讀書筆記'], { path: 'a.md', added: ['讀書筆記'], removed: [] })
    expect(tags).toEqual(['投資'])
  })

  it('把這次移除的標籤加回來', () => {
    const tags = revertTags(['投資'], { path: 'a.md', added: [], removed: ['舊標籤'] })
    expect(tags).toEqual(['投資', '舊標籤'])
  })

  it('使用者後來自己刪掉的標籤不會被硬塞回去', () => {
    const tags = revertTags(['投資'], { path: 'a.md', added: ['已經被手動刪掉'], removed: [] })
    expect(tags).toEqual(['投資'])
  })

  it('使用者後來自己加的標籤不會被誤傷', () => {
    const tags = revertTags(['投資', '手動加的'], { path: 'a.md', added: ['投資'], removed: [] })
    expect(tags).toEqual(['手動加的'])
  })

  it('已經存在的標籤不會重複加回來', () => {
    const tags = revertTags(['舊標籤'], { path: 'a.md', added: [], removed: ['舊標籤'] })
    expect(tags).toEqual(['舊標籤'])
  })
})

describe('systemAddedTags', () => {
  it('列出這個系統替某篇筆記加過的標籤', () => {
    let ledger = emptyLedger()
    ledger = recordRun(ledger, run('snap-1', [{ path: 'a.md', added: ['投資'] }]))
    ledger = recordRun(ledger, run('snap-2', [{ path: 'a.md', added: ['讀書筆記'] }]))
    expect([...systemAddedTags(ledger, 'a.md')].sort()).toEqual(['投資', '讀書筆記'])
  })

  it('後來被移除的標籤不再算是系統加的', () => {
    let ledger = emptyLedger()
    ledger = recordRun(ledger, run('snap-1', [{ path: 'a.md', added: ['投資'] }]))
    ledger = recordRun(ledger, run('snap-2', [{ path: 'a.md', removed: ['投資'] }]))
    expect([...systemAddedTags(ledger, 'a.md')]).toEqual([])
  })

  it('只看指定的那篇筆記', () => {
    const ledger = recordRun(emptyLedger(), run('snap-1', [{ path: 'b.md', added: ['投資'] }]))
    expect([...systemAddedTags(ledger, 'a.md')]).toEqual([])
  })
})

describe('findRun 與 dropRun', () => {
  const ledger = recordRun(emptyLedger(), run('snap-1', [{ path: 'a.md', added: ['投資'] }]))

  it('找得到指定的紀錄', () => {
    expect(findRun(ledger, 'snap-1')?.entries).toHaveLength(1)
    expect(findRun(ledger, 'nope')).toBeUndefined()
  })

  it('廢棄之後把紀錄拿掉，不動到原本的物件', () => {
    const after = dropRun(ledger, 'snap-1')
    expect(after.runs).toHaveLength(0)
    expect(ledger.runs).toHaveLength(1)
  })
})

describe('parseLedger', () => {
  it('讀得回寫出去的內容', () => {
    const ledger = recordRun(emptyLedger(), run('snap-1', [{ path: 'a.md', added: ['投資'] }]))
    expect(parseLedger(JSON.stringify(ledger))).toEqual(ledger)
  })

  it('檔案壞掉或不存在時回空 ledger，不讓整個工具掛掉', () => {
    expect(parseLedger('這不是 json')).toEqual(emptyLedger())
    expect(parseLedger('')).toEqual(emptyLedger())
    expect(parseLedger('{"version":99}')).toEqual(emptyLedger())
  })
})

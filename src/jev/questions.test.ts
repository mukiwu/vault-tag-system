import { describe, expect, it } from 'vitest'
import { buildQuestionSet, buildState, planBatches } from './questions'
import type { TagInfo } from '../core/vault'

const tag = (name: string, count = 3): TagInfo => ({
  tag: name,
  count,
  samples: [`${name} 筆記一`, `${name} 筆記二`],
})

describe('buildQuestionSet', () => {
  const set = buildQuestionSet([tag('投資'), tag('讀書筆記')])

  it('每個標籤產生一題 noul', () => {
    expect(Object.keys(set.questions)).toHaveLength(2)
    for (const question of Object.values(set.questions)) {
      expect(question.type).toBe('noul')
    }
  })

  it('問題 id 能對回原本的標籤', () => {
    const ids = Object.keys(set.questions)
    expect(ids.map((id) => set.tagById.get(id))).toEqual(['投資', '讀書筆記'])
  })

  it('問題 id 不直接使用標籤字串，避免特殊字元出問題', () => {
    const tricky = buildQuestionSet([tag('投資/美股'), tag('a b c')])
    for (const id of Object.keys(tricky.questions)) {
      expect(id).toMatch(/^[a-z0-9_]+$/)
    }
    expect([...tricky.tagById.values()]).toEqual(['投資/美股', 'a b c'])
  })

  it('把標籤與既有用例放進 instructions，讓判定貼著 vault 的慣例', () => {
    const [id] = Object.keys(set.questions)
    const instructions = set.questions[id].instructions as Record<string, unknown>
    expect(instructions.tag).toBe('投資')
    expect(instructions.used_in_vault).toEqual(['投資 筆記一', '投資 筆記二'])
    expect(typeof instructions.question).toBe('string')
  })

  it('criteria 明寫邊界，因為模型只照字面回答', () => {
    const [id] = Object.keys(set.questions)
    const criteria = set.questions[id].criteria
    expect(criteria?.true).toBeTruthy()
    expect(criteria?.false).toBeTruthy()
  })

  it('沒有標籤時產生空的問題集', () => {
    const empty = buildQuestionSet([])
    expect(Object.keys(empty.questions)).toHaveLength(0)
  })
})

describe('planBatches', () => {
  const tags = Array.from({ length: 250 }, (_, i) => tag(`標籤${i}`))

  it('標籤數量在上限內時只有一批', () => {
    expect(planBatches(tags.slice(0, 50), 120)).toHaveLength(1)
  })

  it('超過上限就切成多批，且不漏標籤', () => {
    const batches = planBatches(tags, 120)
    expect(batches).toHaveLength(3)
    expect(batches.flat()).toHaveLength(250)
    expect(batches.flat().map((t) => t.tag)).toEqual(tags.map((t) => t.tag))
  })

  it('沒有標籤時回空陣列', () => {
    expect(planBatches([], 120)).toEqual([])
  })
})

describe('buildState', () => {
  it('只帶判定需要的欄位，避免無關內容干擾模型', () => {
    const state = buildState({
      path: 'a/b.md',
      title: '標題',
      tags: ['投資'],
      excerpt: '內文',
    })
    expect(state).toEqual({
      title: '標題',
      path: 'a/b.md',
      existing_tags: ['投資'],
      content: '內文',
    })
  })
})

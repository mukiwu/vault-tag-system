import type { Note, TagInfo } from '../core/vault'
import type { JevNoulQuestion } from './types'

/**
 * 把標籤字典轉成一批 noul 問題。
 *
 * 一篇筆記配 N 個標籤就是 N 題，全部塞進同一個 request 平行評估，官方的說法是
 * 加問題幾乎不增加耗時，所以整個 vault 的請求數等於筆記數而不是筆記數乘標籤數。
 */

export type QuestionSet = {
  questions: Record<string, JevNoulQuestion>
  /** 問題 id 對回標籤字串 */
  tagById: Map<string, string>
}

/**
 * 每個 request 的標籤數上限。context 是 64k tokens，扣掉 state 之後還很寬裕，
 * 這個值保守取，標籤更多時自動切批。
 */
export const DEFAULT_BATCH_SIZE = 120

export function buildQuestionSet(tags: readonly TagInfo[]): QuestionSet {
  const questions: Record<string, JevNoulQuestion> = {}
  const tagById = new Map<string, string>()

  tags.forEach((info, index) => {
    // 標籤可能含斜線、空白或中文，問題 id 一律用序號，另外留一份對照表
    const id = `tag_${index}`
    tagById.set(id, info.tag)

    questions[id] = {
      type: 'noul',
      instructions: {
        tag: info.tag,
        used_in_vault: info.samples,
        question: '這篇筆記的主題，應該掛上 tag 這個標籤嗎',
      },
      // 模型只照字面回答，邊界要自己寫清楚，尤其是順帶提到不算數這件事
      criteria: {
        true: {
          what: '這篇筆記的主要主題確實屬於這個標籤，和 used_in_vault 那幾篇是同一類',
        },
        false: {
          what: '主題不屬於這個標籤，或只是在文中順帶提到',
          examples: ['這個詞在文中出現過，但不是筆記在談的事情'],
        },
      },
    }
  })

  return { questions, tagById }
}

/** 標籤太多時切批，同一篇筆記發數次請求再把答案併起來 */
export function planBatches(
  tags: readonly TagInfo[],
  size = DEFAULT_BATCH_SIZE,
): TagInfo[][] {
  const batches: TagInfo[][] = []
  for (let i = 0; i < tags.length; i += size) {
    batches.push(tags.slice(i, i + size))
  }
  return batches
}

/** 送給 Jev 的 state，只帶判定需要的欄位，多餘內容會變成干擾 */
export function buildState(note: Note) {
  return {
    title: note.title,
    path: note.path,
    existing_tags: note.tags,
    content: note.excerpt,
  }
}

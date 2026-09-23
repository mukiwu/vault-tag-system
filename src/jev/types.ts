/** Jev system one API 的最小型別，只涵蓋這個專案用到的 noul 問題 */

export type JevInstructions = string | Record<string, unknown> | readonly unknown[]

export type JevNoulQuestion = {
  type: 'noul'
  instructions: JevInstructions
  criteria?: { true?: unknown; false?: unknown }
}

export type JevRequest = {
  state: unknown
  model?: string
  questions: Record<string, JevNoulQuestion>
}

export type JevAnswer = {
  type: string
  /** 0 到 1 的機率，同時代表答案與確定程度 */
  noul?: number
}

export type JevResponse = {
  model: string
  answers: Record<string, JevAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

import type { Grid } from './grid'

/**
 * 判定值的分布。
 *
 * 門檻要設在哪，看分布比憑感覺準：實際的 noul 極度右偏，絕大多數格子擠在接近 0
 * 的地方，真正要決定的只有尾巴那一小撮。
 */
export function histogram(grid: Grid, bins = 52): number[] {
  const counts = new Array<number>(bins).fill(0)

  for (const noul of grid.nouls) {
    if (Number.isNaN(noul)) continue
    // 1.0 要落在最後一個區間而不是溢位
    const index = Math.min(bins - 1, Math.floor(noul * bins))
    counts[index] += 1
  }

  return counts
}

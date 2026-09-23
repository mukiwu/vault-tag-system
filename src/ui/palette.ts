import { status } from '../core/decision'
import type { Cell, Thresholds } from '../core/decision'

/**
 * 結點怎麼畫。
 *
 * 三重編碼：顏色與大小都跟著信心走，形狀說明這一格的來歷。顏色與大小是刻意的
 * 冗餘，掃視時兩個訊號互相加強，辨色有困難時也還讀得出強弱。
 */

/** 建議廢棄用固定的警示色，不跟著信心色階走。整個 app 只有這一支藍 */
export const WARN = 'oklch(0.7 0.125 218)'

/** 原有維持退成中性，冷色一出現就是要注意的格子 */
export const KEEP = 'oklch(0.6 0.014 72)'

/**
 * 色階的停駐點，OKLCH 的 L C H。
 *
 * 在 OKLCH 裡插值而不是 RGB：它的明度是感知均勻的，每一階看起來的亮度差才會
 * 一致，暖色階在 RGB 空間插值會經過偏濁的中間色。
 */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [0.3, 0.035, 65]],
  [0.28, [0.45, 0.078, 70]],
  [0.52, [0.6, 0.115, 76]],
  [0.74, [0.73, 0.145, 82]],
  [1.0, [0.85, 0.155, 88]],
]

const fmt = ([l, c, h]: readonly number[]) =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`

/** 量化到 256 階存起來，判定進行中每幀都要算上千格，插值不必重複做 */
const CACHE = new Map<number, string>()

/** 連續色階：低信心幾乎融進底色，高信心亮起來 */
export function ramp(t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const key = Math.round(clamped * 255)

  const cached = CACHE.get(key)
  if (cached !== undefined) return cached

  for (let i = 1; i < STOPS.length; i += 1) {
    if (clamped <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1]
      const [p1, c1] = STOPS[i]
      const k = (clamped - p0) / (p1 - p0)
      const mix = c0.map((v, j) => v + (c1[j] - v) * k)
      const color = fmt(mix)
      CACHE.set(key, color)
      return color
    }
  }

  const last = fmt(STOPS[STOPS.length - 1][1])
  CACHE.set(key, last)
  return last
}

export type NodeStyle = {
  size: string
  radius: string
  fill: string
  border: string
  /** 人工決定過的外環，跟自動判定區分 */
  ring: string
  label: string
}

const MANUAL_RING = '0 0 0 1.5px oklch(0.9 0.014 78 / 0.55)'

export function nodeStyle(cell: Cell, thresholds: Thresholds): NodeStyle {
  const current = status(cell, thresholds)
  const t = cell.noul ?? (cell.original ? 1 : 0)
  const color = ramp(t)
  const ring = cell.override === undefined ? 'none' : MANUAL_RING

  switch (current) {
    case 'keep':
      return {
        size: `${Math.round(10 + t * 5)}px`,
        radius: '0',
        fill: 'transparent',
        border: `1.5px solid ${KEEP}`,
        ring,
        label: '原有，維持',
      }

    case 'suggest-drop':
      return { size: '13px', radius: '0', fill: WARN, border: '0', ring, label: '建議廢棄' }

    case 'drop':
      return { size: '13px', radius: '0', fill: WARN, border: '0', ring, label: '人工移除' }

    case 'add':
      return {
        size: `${Math.round(11 + t * 5)}px`,
        radius: '50%',
        fill: color,
        border: '0',
        ring,
        label: '自動加上',
      }

    case 'manual-add':
      return {
        size: `${Math.round(11 + t * 5)}px`,
        radius: '50%',
        fill: color,
        border: '0',
        ring,
        label: '人工加上',
      }

    case 'review':
      return {
        size: `${Math.round(7 + t * 7)}px`,
        radius: '50%',
        fill: 'transparent',
        border: `1.5px dashed ${color}`,
        ring,
        label: '待審核',
      }

    default:
      return {
        size: `${Math.max(2, Math.round(t * 8))}px`,
        radius: '50%',
        fill: color,
        border: '0',
        ring,
        label: '不加',
      }
  }
}

/** 側欄圖例，跟矩陣用同一組規則畫出來 */
export const LEGEND: { label: string; cell: Cell }[] = [
  { label: '自動加上', cell: { original: false, noul: 0.96 } },
  { label: '待審核', cell: { original: false, noul: 0.6 } },
  { label: '原有，維持', cell: { original: true, noul: 0.95 } },
  { label: '建議廢棄', cell: { original: true, noul: 0.05 } },
  { label: '不加', cell: { original: false, noul: 0.08 } },
]

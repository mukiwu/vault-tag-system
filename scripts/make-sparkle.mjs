/**
 * 產生 hover 時的星芒爆發動畫（Lottie JSON）
 *
 * 手寫 Lottie JSON 很難讀也難調，所以改用腳本生成：
 * 要調整星芒數量、節奏或顏色，改下面的常數再跑一次 `node scripts/make-sparkle.mjs`
 */

import { writeFileSync } from 'node:fs'

const FPS = 60
const DURATION = 46 // 幀數，約 0.77 秒
const W = 180
const H = 52

/** 星芒散佈的位置。刻意避開正中央，文字要讀得到 */
const SPARKS = [
  { x: 18, y: 12, size: 7.5, delay: 0, spin: 12 },
  { x: 156, y: 38, size: 7, delay: 2, spin: -18 },
  { x: 42, y: 42, size: 5, delay: 5, spin: 30 },
  { x: 132, y: 10, size: 6, delay: 4, spin: -8 },
  { x: 90, y: 6, size: 5.5, delay: 8, spin: 22 },
  { x: 8, y: 34, size: 4.5, delay: 10, spin: -25 },
  { x: 168, y: 18, size: 5, delay: 7, spin: 15 },
  { x: 66, y: 46, size: 4, delay: 12, spin: -12 },
  { x: 110, y: 44, size: 4.5, delay: 14, spin: 20 },
  { x: 28, y: 24, size: 3.5, delay: 16, spin: -30 },
  { x: 148, y: 28, size: 4, delay: 13, spin: 10 },
  { x: 78, y: 16, size: 3.5, delay: 18, spin: -20 },
]

const LIFE = 16 // 每顆星芒從冒出到消失的幀數

/** Lottie 的顏色是 0 到 1 的浮點數 */
const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  1,
]

const CORE = rgb('#d6f5fb') // 星芒本體，接近白
const GLOW = rgb('#5fb49c') // 底下那層光暈，青色

/** 帶緩動的關鍵影格，o/i 是 Lottie 的貝茲控制點 */
const key = (t, v, ease = true) => ({
  t,
  s: Array.isArray(v) ? v : [v],
  ...(ease ? { o: { x: [0.35], y: [0] }, i: { x: [0.65], y: [1] } } : {}),
})

function sparkLayer(spark, index) {
  const { x, y, size, delay, spin } = spark
  const peak = delay + LIFE * 0.34
  const end = delay + LIFE

  return {
    ddd: 0,
    ind: index + 2,
    ty: 4, // shape layer
    nm: `spark-${index}`,
    sr: 1,
    ks: {
      o: {
        a: 1,
        k: [key(delay, 0), key(peak, 100), key(end, 0)],
      },
      r: { a: 1, k: [key(delay, spin - 30), key(end, spin + 30)] },
      p: { a: 0, k: [x, y, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          key(delay, [0, 0, 100]),
          key(peak, [120, 120, 100]),
          key(end, [0, 0, 100]),
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: 'gr',
        nm: 'star',
        it: [
          {
            ty: 'sr', // star
            sy: 1,
            d: 1,
            pt: { a: 0, k: 4 }, // 四芒
            p: { a: 0, k: [0, 0] },
            r: { a: 0, k: 0 },
            // 內半徑壓很小才會尖，像閃光而不是胖星星
            ir: { a: 0, k: size * 0.14 },
            is: { a: 0, k: 0 },
            or: { a: 0, k: size },
            os: { a: 0, k: 0 },
          },
          { ty: 'fl', c: { a: 0, k: CORE }, o: { a: 0, k: 100 }, r: 1 },
          {
            ty: 'tr',
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 },
          },
        ],
      },
    ],
    ip: 0,
    op: DURATION,
    st: 0,
  }
}

/** 底層的一團光暈，讓爆發有重量，不會只是一堆碎點 */
const glowLayer = {
  ddd: 0,
  ind: 1,
  ty: 4,
  nm: 'glow',
  sr: 1,
  ks: {
    o: { a: 1, k: [key(0, 0), key(10, 72), key(34, 0)] },
    r: { a: 0, k: 0 },
    p: { a: 0, k: [W / 2, H / 2, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 1, k: [key(0, [40, 40, 100]), key(30, [125, 125, 100])] },
  },
  ao: 0,
  shapes: [
    {
      ty: 'gr',
      nm: 'halo',
      it: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [W * 0.62, H * 0.8] } },
        {
          // 純色填充在 Lottie 裡沒有羽化，會變成一坨色塊。
          // 用徑向漸層讓邊緣淡出，才像光
          ty: 'gf',
          o: { a: 0, k: 100 },
          r: 1,
          t: 2, // radial
          s: { a: 0, k: [0, 0] },
          e: { a: 0, k: [W * 0.31, 0] },
          g: {
            p: 4,
            k: {
              a: 0,
              k: [
                // 顏色停駐點：位置, r, g, b
                0, ...GLOW.slice(0, 3),
                0.3, ...GLOW.slice(0, 3),
                0.62, ...GLOW.slice(0, 3),
                1, ...GLOW.slice(0, 3),
                // 透明度停駐點：位置, alpha。衰減要快，不然會看出橢圓的形狀
                0, 1,
                0.3, 0.46,
                0.62, 0.1,
                1, 0,
              ],
            },
          },
        },
        {
          ty: 'tr',
          p: { a: 0, k: [0, 0] },
          a: { a: 0, k: [0, 0] },
          s: { a: 0, k: [100, 100] },
          r: { a: 0, k: 0 },
          o: { a: 0, k: 100 },
        },
      ],
    },
  ],
  ip: 0,
  op: DURATION,
  st: 0,
}

const animation = {
  v: '5.9.0',
  fr: FPS,
  ip: 0,
  op: DURATION,
  w: W,
  h: H,
  nm: 'chip-sparkle',
  ddd: 0,
  assets: [],
  layers: [...SPARKS.map(sparkLayer), glowLayer],
}

const out = new URL('../src/ui/sparkle.json', import.meta.url)
writeFileSync(out, JSON.stringify(animation))
console.log(
  `已產生 ${SPARKS.length} 顆星芒，${(JSON.stringify(animation).length / 1024).toFixed(1)} KB`,
)

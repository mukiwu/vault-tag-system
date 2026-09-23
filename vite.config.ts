/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Jev 的 CORS 白名單不收 localhost，瀏覽器直接打它的 API 會被 preflight 擋下來
 * （Disallowed CORS origin），所以一定要經過這層 proxy。
 *
 * 金鑰由前端在 x-typesafe-key 這個自訂標頭帶過來，這裡才換成正式的 Authorization。
 * 這樣使用者可以在畫面上填金鑰、存在自己的瀏覽器，不必碰任何設定檔。
 * TYPESAFE_API_KEY 環境變數仍然可用，當作開發時的預設值。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fallbackKey = env.TYPESAFE_API_KEY

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/jev': {
          target: 'https://api.typesafe.ai',
          changeOrigin: true,
          rewrite: () => '/v1/systemone',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const sent = req.headers['x-typesafe-key']
              const key = (Array.isArray(sent) ? sent[0] : sent) || fallbackKey

              // 金鑰只在本機轉手，換成正式標頭之後就不留痕跡
              proxyReq.removeHeader('x-typesafe-key')
              if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)

              // 帶著瀏覽器的來源資訊出去只會撞上 CORS 白名單
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
            })
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})

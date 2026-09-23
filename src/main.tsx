import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store'

// 開發時把 store 掛出來，方便在 console 觀察與灌測試資料
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

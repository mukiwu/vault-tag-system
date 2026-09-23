/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 線上版的轉發層網址，本機開發留空就會走 Vite proxy */
  readonly VITE_JEV_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

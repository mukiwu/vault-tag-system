/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 線上版的轉發層網址，本機開發留空就會走 Vite proxy */
  readonly VITE_JEV_ENDPOINT?: string
  /** 站方開放的試用篇數，留空或 0 代表不開放 */
  readonly VITE_TRIAL_NOTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

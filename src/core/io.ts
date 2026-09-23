/**
 * vault 的讀寫介面。
 *
 * 真正的實作跑在 File System Access API 上，但寫回、廢棄、回滾這幾個破壞性
 * 操作的邏輯都只依賴這個介面，所以可以用記憶體版本完整測試。
 */
export interface VaultIO {
  /** 讀一篇筆記 */
  read(path: string): Promise<string>
  /** 寫回一篇筆記 */
  write(path: string, content: string): Promise<void>
  /** 讀 .tag-system 底下的檔案，不存在時回 null */
  readMeta(path: string): Promise<string | null>
  /** 寫 .tag-system 底下的檔案 */
  writeMeta(path: string, content: string): Promise<void>
  /** 刪 .tag-system 底下的檔案，不存在時當作已完成 */
  deleteMeta(path: string): Promise<void>
}

export const META_DIR = '.tag-system'
export const LEDGER_FILE = 'ledger.json'

export const snapshotFile = (id: string) => `snapshots/${id}.json`

/**
 * 把選過的 vault handle 記在 IndexedDB，重開頁面不用再選一次資料夾。
 * handle 本身可以被結構化複製，但權限不會跟著留下，重開後仍要再確認一次。
 */

const DB_NAME = 'vault-tag-system'
const STORE = 'handles'
const KEY = 'vault'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function saveVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(handle, KEY))
  } catch {
    // 記不起來只是少了便利性，不該影響主要流程
  }
}

export async function loadVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function clearVaultHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY))
  } catch {
    // 同上，清不掉也不影響使用
  }
}

const API_KEY_STORAGE = 'vault-tag-system:api-key'

/**
 * 金鑰存在瀏覽器本機，只會隨請求送到同一台機器上的 proxy。
 * localStorage 在無痕模式或封鎖網站資料時會直接拋錯，所以一律包起來。
 */
export function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key === '') localStorage.removeItem(API_KEY_STORAGE)
    else localStorage.setItem(API_KEY_STORAGE, key)
  } catch {
    // 存不起來只是下次要再填一次，不影響這次使用
  }
}

const EXCLUDED_PREFIX = 'vault-tag-system:excluded:'

/** 排除的資料夾依 vault 分開記，換 vault 不會互相干擾 */
export function loadExcludedFolders(vault: string): string[] {
  try {
    const raw = localStorage.getItem(EXCLUDED_PREFIX + vault)
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveExcludedFolders(vault: string, folders: readonly string[]): void {
  try {
    localStorage.setItem(EXCLUDED_PREFIX + vault, JSON.stringify(folders))
  } catch {
    // 記不起來只是下次要再選一次
  }
}

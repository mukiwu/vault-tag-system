import { META_DIR } from '../core/io'
import type { VaultIO } from '../core/io'

/**
 * File System Access API 的實作層。
 *
 * 選一次資料夾就能直接讀寫原檔，筆記完全不需要離開這台機器，只有裁切過的
 * 內文會送去 Jev 判定。
 */

export type VaultFile = {
  /** vault 內的相對路徑 */
  path: string
  handle: FileSystemFileHandle
}

const SKIP_DIRS = new Set(['node_modules'])

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  if (!isSupported()) {
    throw new Error('這個瀏覽器不支援直接讀寫本機資料夾，請改用 Chrome 或 Edge')
  }
  return window.showDirectoryPicker({ id: 'vault-tag-system', mode: 'readwrite' })
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  return (await handle.requestPermission({ mode })) === 'granted'
}

export type ScanResult = {
  files: VaultFile[]
  /** 副檔名不是 .md 而被擋下來的檔案數，只計數，不讀內容 */
  others: number
}

/**
 * 遞迴收集所有 markdown，點開頭的目錄一律跳過，Obsidian 的設定與本工具的資料都在那裡。
 * 非 .md 的檔案連讀都不會讀，但要把數量回報出去，讓畫面說得出過濾掉了什麼。
 */
export async function collectMarkdown(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<ScanResult> {
  const files: VaultFile[] = []
  let others = 0

  for await (const entry of dir.values()) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.kind === 'directory') {
      const nested = await collectMarkdown(entry, path)
      files.push(...nested.files)
      others += nested.others
    } else if (/\.md$/i.test(entry.name)) {
      files.push({ path, handle: entry })
    } else {
      others += 1
    }
  }

  return { files, others }
}

async function resolveFile(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/')
  const name = parts.pop()
  if (name === undefined || name === '') throw new Error(`路徑不正確：${path}`)

  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return dir.getFileHandle(name, { create })
}

async function readAt(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const handle = await resolveFile(root, path, false)
  return (await handle.getFile()).text()
}

async function writeAt(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
  create: boolean,
): Promise<void> {
  const handle = await resolveFile(root, path, create)
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

async function removeAt(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split('/')
  const name = parts.pop()
  if (name === undefined || name === '') return

  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part)
  }
  await dir.removeEntry(name)
}

export function createVaultIO(root: FileSystemDirectoryHandle): VaultIO {
  return {
    read: (path) => readAt(root, path),
    // 筆記一定要已經存在，不允許因為路徑寫錯而生出空檔
    write: (path, content) => writeAt(root, path, content, false),
    async readMeta(path) {
      try {
        return await readAt(root, `${META_DIR}/${path}`)
      } catch {
        return null
      }
    },
    // 本工具自己的資料夾則要能從無到有建出來
    writeMeta: (path, content) => writeAt(root, `${META_DIR}/${path}`, content, true),
    deleteMeta: (path) => removeAt(root, `${META_DIR}/${path}`),
  }
}

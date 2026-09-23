import type { Note } from './vault'

/**
 * 依資料夾篩選。
 *
 * 大 vault 常有附件、範本、匯入暫存這類目錄，裡面的檔案雖然也是帶 frontmatter
 * 的 .md，但不該進判定：它們會污染標籤字典，也白白吃掉 token。
 */

export type FolderStat = {
  /** 筆記直接所在的資料夾，根目錄是空字串 */
  folder: string
  count: number
}

export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

export function folderStats(notes: readonly Note[]): FolderStat[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const folder = folderOf(note.path)
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder))
}

export function excludeFolders(
  notes: readonly Note[],
  excluded: ReadonlySet<string>,
): Note[] {
  if (excluded.size === 0) return [...notes]

  return notes.filter((note) => {
    const folder = folderOf(note.path)
    if (excluded.has(folder)) return false
    // 排除一個資料夾就連它底下的子資料夾一起排除，
    // 但名稱只是前綴相同的（附件 對 附件庫）不算
    for (const one of excluded) {
      if (one !== '' && folder.startsWith(`${one}/`)) return false
    }
    return true
  })
}

export type FolderNode = {
  /** 這一層的名稱，根目錄是空字串 */
  name: string
  /** 完整路徑，對應排除設定 */
  path: string
  /** 直接放在這一層的篇數 */
  count: number
  /** 含所有子孫的篇數 */
  total: number
  children: FolderNode[]
}

/**
 * 把路徑攤平的筆記長成一棵樹。
 *
 * 中間層就算自己沒有檔案也要有節點，否則樹會斷開，深一層的資料夾就選不到了。
 */
export function folderTree(notes: readonly Note[]): FolderNode[] {
  const roots: FolderNode[] = []
  const byPath = new Map<string, FolderNode>()

  const ensure = (path: string, name: string, parent: FolderNode[]): FolderNode => {
    const found = byPath.get(path)
    if (found) return found

    const node: FolderNode = { name, path, count: 0, total: 0, children: [] }
    byPath.set(path, node)
    parent.push(node)
    return node
  }

  for (const note of notes) {
    const folder = folderOf(note.path)

    if (folder === '') {
      ensure('', '', roots).count += 1
      continue
    }

    const segments = folder.split('/')
    let siblings = roots
    let path = ''

    for (const segment of segments) {
      path = path === '' ? segment : `${path}/${segment}`
      const node = ensure(path, segment, siblings)
      siblings = node.children
    }

    const leaf = byPath.get(folder)
    if (leaf) leaf.count += 1
  }

  const settle = (nodes: FolderNode[]): number => {
    let sum = 0
    for (const node of nodes) {
      node.total = node.count + settle(node.children)
      sum += node.total
    }
    // 同層依名稱排序，根目錄那一筆沒有名字，自然排到最後
    nodes.sort((a, b) => (a.path === '' ? 1 : b.path === '' ? -1 : a.name.localeCompare(b.name)))
    return sum
  }
  settle(roots)

  return roots
}

/** 這個資料夾是不是因為某個上層被排除而連帶被排除 */
export function isExcludedByAncestor(path: string, excluded: ReadonlySet<string>): boolean {
  if (path === '') return false

  for (const one of excluded) {
    if (one !== '' && one !== path && path.startsWith(`${one}/`)) return true
  }
  return false
}

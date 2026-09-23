import { useEffect, useMemo, useRef, useState } from 'react'
import { isExcludedByAncestor } from '../core/folders'
import type { FolderNode } from '../core/folders'
import { useStore } from '../store'

const ROOT_LABEL = '根目錄'
const INDENT = 14

const labelOf = (node: FolderNode) => node.name || ROOT_LABEL

/** 搜尋時保留命中的節點，以及通往它的那條路徑 */
function filterTree(nodes: readonly FolderNode[], query: string): FolderNode[] {
  if (query === '') return [...nodes]

  return nodes.flatMap((node) => {
    const hit = labelOf(node).toLowerCase().includes(query)
    const children = filterTree(node.children, query)
    if (!hit && children.length === 0) return []
    return [{ ...node, children: hit ? node.children : children }]
  })
}

function collectPaths(nodes: readonly FolderNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.path)
    collectPaths(node.children, into)
  }
  return into
}

type RowProps = {
  node: FolderNode
  depth: number
  excluded: Set<string>
  open: Set<string>
  forceOpen: boolean
  onToggleOpen: (path: string) => void
  onToggleExcluded: (path: string) => void
}

function Row({ node, depth, excluded, open, forceOpen, onToggleOpen, onToggleExcluded }: RowProps) {
  const hasChildren = node.children.length > 0
  const expanded = forceOpen || open.has(node.path)

  const byAncestor = isExcludedByAncestor(node.path, excluded)
  const off = excluded.has(node.path) || byAncestor

  return (
    <>
      <div className="tree-row" style={{ paddingInlineStart: 6 + depth * INDENT }}>
        {hasChildren ? (
          <button
            className="twist"
            aria-label={expanded ? `收合 ${labelOf(node)}` : `展開 ${labelOf(node)}`}
            aria-expanded={expanded}
            onClick={() => onToggleOpen(node.path)}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d={expanded ? 'M1 3 L5 7 L9 3' : 'M3 1 L7 5 L3 9'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        ) : (
          <span className="twist" />
        )}

        <label className="tree-label">
          <input
            type="checkbox"
            checked={!off}
            disabled={byAncestor}
            onChange={() => onToggleExcluded(node.path)}
          />
          <span className={off ? 'name off' : 'name'} title={node.path || ROOT_LABEL}>
            {labelOf(node)}
          </span>
        </label>

        <span className="mono muted count">{node.total}</span>
      </div>

      {expanded &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            excluded={excluded}
            open={open}
            forceOpen={forceOpen}
            onToggleOpen={onToggleOpen}
            onToggleExcluded={onToggleExcluded}
          />
        ))}
    </>
  )
}

/**
 * 依資料夾排除，長得像檔案樹。
 *
 * 大 vault 常有附件、匯入暫存這類目錄，裡面也是帶 frontmatter 的 .md，
 * 但不該進判定：會污染標籤字典，也白白吃掉 token。
 */
export function FolderFilter() {
  const folders = useStore((s) => s.folders)
  const excludedList = useStore((s) => s.excludedFolders)
  const included = useStore((s) => s.notes.length)
  const all = useStore((s) => s.allNotes.length)
  const toggleFolder = useStore((s) => s.toggleFolder)
  const setExcludedFolders = useStore((s) => s.setExcludedFolders)

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  // 點到面板外面就收起來
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const needle = query.trim().toLowerCase()
  const visible = useMemo(() => filterTree(folders, needle), [folders, needle])
  const excluded = useMemo(() => new Set(excludedList), [excludedList])

  if (folders.length === 0) return null

  const toggleOpen = (path: string) => {
    setExpanded((was) => {
      const next = new Set(was)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="folders" ref={boxRef}>
      <button onClick={() => setOpen((was) => !was)} aria-expanded={open}>
        資料夾
        {excludedList.length > 0 ? `　排除 ${excludedList.length}` : ''}
      </button>

      {open && (
        <div className="popover">
          <div className="popover-head">
            <input
              type="text"
              value={query}
              placeholder="搜尋資料夾"
              aria-label="搜尋資料夾"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button onClick={() => setExcludedFolders([])} disabled={excludedList.length === 0}>
              全部納入
            </button>
            <button onClick={() => setExcludedFolders(collectPaths(folders))}>全部排除</button>
          </div>

          <div className="popover-list">
            {visible.length === 0 ? (
              <p className="hint" style={{ padding: '10px 12px', margin: 0 }}>
                沒有符合的資料夾
              </p>
            ) : (
              visible.map((node) => (
                <Row
                  key={node.path}
                  node={node}
                  depth={0}
                  excluded={excluded}
                  open={expanded}
                  forceOpen={needle !== ''}
                  onToggleOpen={toggleOpen}
                  onToggleExcluded={toggleFolder}
                />
              ))
            )}
          </div>

          <div className="popover-foot">
            納入 <span className="mono">{included}</span> 篇，共 <span className="mono">{all}</span> 篇
          </div>
        </div>
      )}
    </div>
  )
}

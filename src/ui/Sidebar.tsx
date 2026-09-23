import { useMemo, useState } from 'react'
import { groupChanges } from '../core/pending'
import { useStore } from '../store'
import { LEGEND, nodeStyle } from './palette'
import { DEFAULT_THRESHOLDS } from '../core/decision'

/**
 * 側欄回答兩個問題：按下寫入會動到什麼，以及做過的事情怎麼收回。
 * 廢棄與回滾是兩件不同的事，刻意分成兩顆按鈕。
 */
export function Sidebar() {
  const notes = useStore((s) => s.notes)
  const runs = useStore((s) => s.runs)
  const phase = useStore((s) => s.phase)
  const thresholds = useStore((s) => s.thresholds)
  const statsRevision = useStore((s) => s.statsRevision)
  const pendingDiffs = useStore((s) => s.pendingDiffs)
  const apply = useStore((s) => s.apply)
  const clearDecisions = useStore((s) => s.clearDecisions)
  const rollbackTo = useStore((s) => s.rollbackTo)
  const revertTo = useStore((s) => s.revertTo)

  // 破壞性動作要點第二次才執行，避免手滑
  const [confirming, setConfirming] = useState<string | null>(null)

  const titleByPath = useMemo(
    () => new Map(notes.map((note) => [note.path, note.title])),
    [notes],
  )

  const { diffs, changes } = useMemo(() => {
    const list = pendingDiffs()
    return { diffs: list, changes: groupChanges(list, titleByPath) }
    // 依賴是刻意指定的失效訊號：grid 就地更新，thresholds 由 pendingDiffs 內部讀取
  }, [pendingDiffs, titleByPath, thresholds, statsRevision])

  const busy = phase === 'applying' || phase === 'scanning' || phase === 'judging'

  const ask = (key: string, run: () => Promise<void>) => {
    if (confirming === key) {
      setConfirming(null)
      void run()
    } else {
      setConfirming(key)
    }
  }

  return (
    <aside className="sidebar">
      <section className="pending">
        <div className="head">
          <h2>待寫入</h2>
          <span className="mono muted">{diffs.length} 篇異動</span>
        </div>

        {changes.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            目前沒有要寫入的改動。跑過判定之後，高信心的建議會自動落在這裡
          </p>
        ) : (
          <div className="list">
            {changes.map((change) => {
              const add = change.kind === 'add'
              return (
                <div
                  key={`${change.kind}:${change.tag}`}
                  className="change"
                  style={{ background: add ? 'var(--add-bg)' : 'var(--remove-bg)' }}
                >
                  <span
                    className="mono sign"
                    style={{ color: add ? 'var(--review)' : 'var(--warn)' }}
                  >
                    {add ? '+' : '−'}
                  </span>
                  <span className="tag">{change.tag}</span>
                  <span className="sample">{change.samples.join('、')}</span>
                  <span className="mono" style={{ color: add ? 'var(--review)' : 'var(--warn)' }}>
                    {change.count}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="actions">
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={busy || diffs.length === 0}
            onClick={() => void apply()}
          >
            寫入並記帳
          </button>
          <button disabled={busy} onClick={clearDecisions}>
            清除人工決定
          </button>
        </div>
      </section>

      <section className="entries">
        <div className="head">
          <h2>已登錄</h2>
          <span className="mono muted">{runs.length} 筆</span>
        </div>

        {runs.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            還沒有寫入紀錄。每次寫入都會留下快照，之後可以整份還原
          </p>
        ) : (
          <div className="list">
            {runs.map((run) => {
              const added = run.entries.reduce((sum, entry) => sum + entry.added.length, 0)
              const removed = run.entries.reduce((sum, entry) => sum + entry.removed.length, 0)
              return (
                <div key={run.id} className="entry">
                  <div className="meta">
                    <span className="mono" style={{ color: 'var(--text)' }}>
                      {new Date(run.at).toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="muted">{run.entries.length} 篇</span>
                    <span className="spacer" />
                    <span className="mono" style={{ color: 'var(--review)' }}>
                      +{added}
                    </span>
                    <span className="mono" style={{ color: 'var(--warn)' }}>
                      &minus;{removed}
                    </span>
                  </div>
                  <div className="actions">
                    <button
                      disabled={busy}
                      title="只把這次加上的標籤收回去，事後自己改的內容保留"
                      onClick={() => ask(`revert:${run.id}`, () => revertTo(run.id))}
                    >
                      {confirming === `revert:${run.id}` ? '再按一次確認' : '廢棄這批標籤'}
                    </button>
                    <button
                      disabled={busy}
                      title="把這幾篇筆記整份還原成當時的樣子，事後的修改會一起被蓋掉"
                      onClick={() => ask(`rollback:${run.id}`, () => rollbackTo(run.id))}
                    >
                      {confirming === `rollback:${run.id}` ? '再按一次確認' : '回滾快照'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="guide">
        <div className="head">
          <h2>結點怎麼讀</h2>
        </div>
        <div className="legend">
          {LEGEND.map((item) => {
            const node = nodeStyle(item.cell, DEFAULT_THRESHOLDS)
            return (
              <div key={item.label} className="item">
                <span className="swatch">
                  <span
                    style={{
                      width: node.size,
                      height: node.size,
                      borderRadius: node.radius,
                      background: node.fill,
                      border: node.border,
                      boxSizing: 'border-box',
                    }}
                  />
                </span>
                <span className="muted">{item.label}</span>
              </div>
            )
          })}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          大小與顏色都跟著信心走，形狀說明它的來歷
        </p>
      </section>
    </aside>
  )
}

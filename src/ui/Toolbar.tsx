import { useMemo } from "react";
import { summarize } from "../core/grid";
import { useStore } from "../store";

/** 每百萬 input tokens 美金 0.042，output 免費 */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/** 頂部列裡跟判定有關的那一段，由 App 的 bar 負責排版 */
export function Toolbar() {
  const grid = useStore((s) => s.grid);
  const thresholds = useStore((s) => s.thresholds);
  const phase = useStore((s) => s.phase);
  const progress = useStore((s) => s.progress);
  const trial = useStore((s) => s.trial);
  const minTagCount = useStore((s) => s.minTagCount);
  const statsRevision = useStore((s) => s.statsRevision);

  const judge = useStore((s) => s.judge);
  const cancelJudge = useStore((s) => s.cancelJudge);
  const setMinTagCount = useStore((s) => s.setMinTagCount);
  const decideBand = useStore((s) => s.decideBand);

  const counts = useMemo(
    // 依賴是刻意指定的失效訊號：grid 就地更新，物件本身不會換
    () => (grid ? summarize(grid, thresholds) : null),
    [grid, thresholds, statsRevision],
  );

  const busy =
    phase === "judging" || phase === "applying" || phase === "scanning";

  return (
    <>
      {phase === "judging" ? (
        <button onClick={cancelJudge}>停止判定</button>
      ) : (
        <button
          className="primary"
          onClick={() => void judge()}
          disabled={busy || !grid}
        >
          開始判定
        </button>
      )}

      {trial && (
        <span className="trial-chip mono" title="站方提供的試用額度，每天重置">
          試用剩 {trial.remaining} 篇
        </span>
      )}

      {progress && (
        <span className="mono muted">
          {progress.done} / {progress.total}
          {progress.failed > 0 ? `　失敗 ${progress.failed}` : ""}　$
          {(progress.inputTokens * USD_PER_INPUT_TOKEN).toFixed(3)}
        </span>
      )}

      {counts && (
        <div className="counts mono">
          <span style={{ color: "var(--auto)" }}>
            自動 {counts.add + counts["manual-add"]}
          </span>
          <span style={{ color: "var(--review)" }}>待審 {counts.pending}</span>
          <span style={{ color: "var(--warn)" }}>
            廢棄 {counts["suggest-drop"] + counts.drop}
          </span>
        </div>
      )}

      <button disabled={!counts?.pending} onClick={() => decideBand(true)}>
        整批採納
      </button>
      <button disabled={!counts?.pending} onClick={() => decideBand(false)}>
        整批退回
      </button>

      <label className="muted" title="使用次數低於這個值的零星標籤不納入判定">
        標籤門檻 {minTagCount}
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={minTagCount}
          onChange={(event) => setMinTagCount(Number(event.target.value))}
        />
      </label>
    </>
  );
}

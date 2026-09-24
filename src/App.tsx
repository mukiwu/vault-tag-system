import { useEffect } from "react";
import { isSupported } from "./fs/directory";
import { TRIAL_NOTES, isProxyReachable, trialAvailable } from "./jev/client";
import { useStore } from "./store";
import { ExternalMark, GithubMark } from "./ui/marks";
import { ApiKeyField } from "./ui/ApiKeyField";
import { CompatChips } from "./ui/CompatChips";
import { FolderFilter } from "./ui/FolderFilter";
import { Histogram } from "./ui/Histogram";
import { Matrix } from "./ui/Matrix";
import { Sidebar } from "./ui/Sidebar";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";

/** 讓外連看得出來會離開這一頁 */

/** 中文不該有換行帶進來的空格，長句一律走常數 */
const COPY = {
  lede: "自動掃描筆記庫內既有的標籤，智慧辨識每篇筆記的關聯度。高把握的直接補上，不確定的留待確認，讓你輕鬆掌控知識標籤網絡。",
  why: "由 Jev AI 進行關聯度分析，每篇筆記都會給出信心分數，作為「自動套用」或「手動審核」的判斷標準。",
  scope:
    "相容所有 .md 檔案，只要開頭具備 YAML Front Matter（以三個減號 --- 包裹的標籤與屬性區塊，如 Hyday、Obsidian 等工具所產生）。本機優先運作，筆記全文不會上傳，僅傳送開頭摘要進行判定，無 Front Matter 的檔案將自動略過。",
  unsupported:
    "直接寫回筆記需要本機檔案存取權限（File System Access API），目前支援 Chrome 與 Edge 瀏覽器，請更換瀏覽器後重新開啟。",
} as const;

export default function App() {
  const vaultName = useStore((s) => s.vaultName);
  const grid = useStore((s) => s.grid);
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  const lastApply = useStore((s) => s.lastApply);
  const skipped = useStore((s) => s.skipped);
  const hasKey = useStore((s) => s.apiKey !== "");
  const trialOptIn = useStore((s) => s.trialOptIn);
  const setTrialMode = useStore((s) => s.setTrialMode);
  const openVault = useStore((s) => s.openVault);
  const closeVault = useStore((s) => s.closeVault);
  const restoreVault = useStore((s) => s.restoreVault);

  // 上次選過的資料夾如果權限還在，直接接著用
  useEffect(() => {
    void restoreVault();
  }, [restoreVault]);

  if (!isSupported()) {
    return (
      <div className="app">
        <div className="landing-container">
          <div className="landing-content">
            <div className="step-card">
              <h2>這個瀏覽器沒辦法直接讀寫你的資料夾</h2>
              <p className="lede">{COPY.unsupported}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {grid && (
        <div className="bar">
          <h1>筆記標籤自動補全</h1>
          {vaultName && <span className="muted">{vaultName}</span>}
          {skipped.noFrontmatter > 0 && (
            <span
              className="mono muted"
              title="沒有 frontmatter 的筆記不會被處理"
            >
              跳過 {skipped.noFrontmatter}
            </span>
          )}

          <FolderFilter />
          <Toolbar />

          <div className="spacer" />

          {phase === "scanning" && <span className="muted">掃描中</span>}
          {lastApply && (
            <span className="muted">
              已寫入 {lastApply.applied} 篇
              {lastApply.failures.length > 0
                ? `，${lastApply.failures.length} 篇失敗`
                : ""}
            </span>
          )}
          <ApiKeyField compact />
          {vaultName && (
            <button onClick={() => void openVault()}>換資料夾</button>
          )}
          {vaultName && <button onClick={() => void closeVault()}>關閉</button>}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {grid ? (
        <div className="main">
          <div className="field">
            <Matrix />
            <StatusBar />
            <Histogram />
          </div>
          <Sidebar />
        </div>
      ) : (
        <div className="landing-container">
          <div className="landing-content">
            {/* Hero Header */}
            <header className="landing-hero">
              <div className="landing-badge">
                <span className="dot" />
                AI-Powered Markdown PKM Tool
              </div>
              <h2>筆記標籤自動補全</h2>
              <p className="lede">{COPY.lede}</p>

              {/* 支援筆記軟體標籤 */}
              <div className="compat-section">
                <span className="compat-label">
                  相容所有支援 Front Matter 的 Markdown 筆記庫：
                </span>
                <CompatChips />
              </div>
            </header>

            <div className="landing-divider" />

            {/* 步驟設定區 */}
            <div className="landing-steps">
              {!isProxyReachable() && (
                <div className="notice">
                  <strong>這個線上版沒辦法判定</strong>
                  <p>
                    Jev
                    不接受瀏覽器直接呼叫，判定得經過一層轉發。你可以把這個專案
                    clone 下來用 npm run dev 跑，或照 README 部署一支自己的
                    Cloudflare Worker。 介面本身仍然可以操作
                  </p>
                </div>
              )}

              {hasKey ? (
                <div className="key-row">
                  <ApiKeyField />
                  <span className="hint">判定會用這把金鑰</span>
                </div>
              ) : (
                <div className="step-card">
                  <div className="step-header">
                    <span className="step-num">1</span>
                    <h3>準備 Jev API 金鑰</h3>
                  </div>
                  <p className="step-desc">{COPY.why}</p>
                  <div className="links">
                    <a
                      className="out"
                      href="https://typesafe.ai"
                      target="_blank"
                      rel="noreferrer"
                    >
                      前往 typesafe.ai 註冊
                      <ExternalMark />
                    </a>
                    <a
                      className="out"
                      href="https://console.typesafe.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      已有帳號，取得金鑰
                      <ExternalMark />
                    </a>
                    {trialAvailable() && !trialOptIn && (
                      <button
                        className="out trial-btn"
                        onClick={() => setTrialMode(true)}
                      >
                        免費試用
                      </button>
                    )}
                  </div>
                  <ApiKeyField />
                  {trialOptIn && (
                    <p className="trial-note">
                      每人每天 {TRIAL_NOTES} 篇免費試用
                    </p>
                  )}
                </div>
              )}

              <div className="step-card">
                <div className="step-header">
                  {!hasKey && <span className="step-num">2</span>}
                  <h3>選擇筆記資料夾 (Vault)</h3>
                </div>
                <div>
                  <button
                    className="primary open-vault-btn"
                    onClick={() => void openVault()}
                  >
                    選擇筆記資料夾 (Vault)
                  </button>
                </div>
                <p className="hint">{COPY.scope}</p>
              </div>
            </div>

            <div className="landing-divider" />

            {/* Footer 版權與社群連結 */}
            <footer className="landing-footer">
              <div className="footer-links">
                <a
                  href="https://hyday.tw"
                  target="_blank"
                  rel="noreferrer"
                  className="footer-brand"
                >
                  <span>Hyday｜AI 個人知識庫秘書 (hyday.tw)</span>
                  <ExternalMark />
                </a>
                <a
                  href="https://github.com/mukiwu/vault-tag-system"
                  target="_blank"
                  rel="noreferrer"
                  className="footer-repo"
                >
                  <GithubMark />
                  <span>原始碼</span>
                </a>
              </div>
              <div className="footer-meta">
                © 2026 Hyday • 專為 Markdown & PKM 知識管理愛好者打造
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

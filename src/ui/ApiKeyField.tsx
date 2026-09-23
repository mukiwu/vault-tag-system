import { useEffect, useState } from "react";
import { useStore } from "../store";

/** 只露出尾巴，確認填對了就好，不用把整串攤在畫面上 */
const mask = (key: string) =>
  key.length <= 6 ? "••••" : `••••${key.slice(-4)}`;

export function ApiKeyField({ compact = false }: { compact?: boolean }) {
  const apiKey = useStore((s) => s.apiKey);
  const setApiKey = useStore((s) => s.setApiKey);

  const [editing, setEditing] = useState(apiKey === "");
  const [draft, setDraft] = useState(apiKey);

  // 金鑰在別處被清掉時，這裡要跟著回到輸入狀態
  useEffect(() => {
    if (apiKey === "") setEditing(true);
  }, [apiKey]);

  const save = () => {
    setApiKey(draft);
    if (draft.trim() !== "") setEditing(false);
  };

  if (!editing) {
    return (
      <div className="apikey">
        <span className="muted">金鑰 {mask(apiKey)}</span>
        <button
          onClick={() => {
            setDraft(apiKey);
            setEditing(true);
          }}
        >
          更換
        </button>
        <button
          title="把金鑰從這個瀏覽器移除，之後要重新貼一次"
          onClick={() => {
            setDraft("");
            setApiKey("");
          }}
        >
          清除
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "apikey" : "apikey block"}>
      <input
        type="password"
        value={draft}
        placeholder="貼上 Jev API Key"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      <button className="primary" onClick={save} disabled={draft.trim() === ""}>
        儲存
      </button>
      {apiKey !== "" && <button onClick={() => setEditing(false)}>取消</button>}
    </div>
  );
}

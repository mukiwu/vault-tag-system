# 筆記標籤自動補全

在瀏覽器裡選一個筆記 vault，用 Jev 依照你現有的標籤體系逐篇判定該不該掛上每個標籤，信心高的自動採納，其餘留給你決定，確認後才寫回 frontmatter

線上版： <https://mukiwu.github.io/vault-tag-system/>

https://github.com/user-attachments/assets/872e61aa-0cc6-4657-8f0a-6cd0ad30f56b

## 怎麼跑

```bash
npm install
npm run dev
```

首頁會帶你走兩步：先貼進 Jev API key，再選 vault 資料夾並授權讀寫

還沒有金鑰的話，到 [typesafe.ai](https://typesafe.ai) 註冊，再從 [console.typesafe.ai](https://console.typesafe.ai) 產生一把。目前是 early access。金鑰存在瀏覽器的 localStorage，不需要設定檔

費用以輸入 token 計。實測一千篇筆記配五十個標籤不到台幣二十元

Jev 的 CORS 白名單不收 localhost，瀏覽器沒辦法直接打它的 API，所以請求會先送到 `/api/jev`，由 Vite dev server 換上 `Authorization` 再轉出去。金鑰只在你的機器上流動

## 哪些檔案會被處理

副檔名是 `.md`，而且帶 YAML frontmatter。兩個條件都成立才會進判定，被擋掉的數量會顯示在頂部

附件或匯入暫存這類目錄裡也常是帶 frontmatter 的 `.md`，但不該進判定。頂部的資料夾按鈕會開出一棵檔案樹，可以展開到任一層逐個排除，排除父層會連同子層一起排除。設定依 vault 記在瀏覽器裡

## 怎麼看矩陣

一列是一篇筆記，一欄是一個標籤，每一格是 Jev 給的 0 到 1 機率。格子畫成結點，顏色與大小跟著信心走，形狀說明來歷

| 結點 | 意思 |
| --- | --- |
| 實心圓 | 原本沒有，信心高，自動加上 |
| 虛線圓 | 落在審核區間，等你決定 |
| 空心方框 | 原本就有，AI 也同意，維持 |
| 實心方塊 | 原本有，但 AI 認為不該有，建議廢棄 |
| 小點 | 兩邊都認為不該有 |

人工決定過的結點會多一圈外環

新增標籤信心夠就自動做，移除既有標籤一律只提建議，要你點頭才會動

三種調整粒度

- 整批：把整個審核區間一次採納或退回
- 整欄：點標籤名整欄採納，按住 alt 點整欄退回
- 單格：點一下採納，再點退回，第三次回到未決定

底部是判定值的分布，兩個門檻畫在上面，拖動把手或用方向鍵就能切。門檻是純前端重算的，拉動不會重打 API

右側欄列出按下寫入會動到哪些標籤與篇數，以及做過的紀錄

## 寫回與反悔

每次寫入都會在 vault 的 `.tag-system/` 留下受影響筆記的完整原文與一份異動紀錄，所以事後有兩種反悔方式，紀錄列表各有一顆按鈕

- 廢棄標籤：只收回那一次加的標籤，你事後自己改的內容保留
- 回滾快照：把那幾篇筆記整份還原成當時的樣子，事後的修改會一起被蓋掉

`.tag-system/` 是點開頭的目錄，Obsidian 預設會忽略

## 開發

```bash
npm test          # 單元測試
npm run typecheck
npm run smoke     # 對 fixtures/demo-vault 跑完整流程，會真的打 Jev
```

`npm run smoke` 把 File System Access API 換成 Node 的 fs，其餘走正式程式碼，用來確認判定品質、成本與寫入回滾是否正確。要先 `export TYPESAFE_API_KEY=...`

核心邏輯在 `src/core/`，全部是純函式且有測試涵蓋。`src/fs/` 是檔案存取，`src/jev/` 是判定層，`src/ui/` 是介面

金鑰相關的兩個狀態碼意思不同，介面上會翻成人話

| 狀態 | 意思 |
| --- | --- |
| 403 | 完全沒帶金鑰，通常是還沒填 |
| 401 | 金鑰有帶但無效，填錯或已被撤銷 |

## 部署到線上

靜態網站沒辦法直接呼叫 Jev，需要一層轉發。本機開發由 Vite dev server 代勞，線上版靠一支 Cloudflare Worker

這支 Worker 不保存任何金鑰。金鑰由使用者自己填、存在自己的瀏覽器，隨請求放在 `x-typesafe-key` 標頭送來，Worker 換成 `Authorization` 再轉出去，所以部署的人不會替訪客付 Jev 的帳

先改 `wrangler.jsonc` 裡的 `ALLOWED_ORIGINS`，填自己的 GitHub Pages 網址。少了這道，這支 Worker 會變成任何人都能用的免費通道

```bash
npx wrangler login
npx wrangler deploy
```

拿到 Worker 網址後，到 GitHub repo 的 Settings，Secrets and variables，Actions，Variables 分頁新增 `JEV_ENDPOINT` 指向它，再把 Settings，Pages 的 Source 設成 GitHub Actions。之後推到 `main` 就會自動建置部署

沒設定 `JEV_ENDPOINT` 的話，線上版首頁會直接標明判定不可用

本機要測整條路徑的話，跑 `npx wrangler dev`，再把 `.env.local` 的 `VITE_JEV_ENDPOINT` 指向 `http://localhost:8787`

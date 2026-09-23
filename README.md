# 筆記自動標籤系統

在瀏覽器裡選一個筆記 vault，用 Jev 依照你現有的標籤體系逐篇判定該不該掛上每個標籤，信心高的自動採納，其餘留給你決定，確認後才寫回 frontmatter

筆記不會離開這台電腦，只有裁切過的內文會送去判定

## 怎麼跑

```bash
npm install
npm run dev
```

打開之後首頁會帶你走兩步：先貼進 Jev API key，再選 vault 資料夾並授權讀寫，就會掃出筆記與標籤

還沒有金鑰的話，到 [typesafe.ai](https://typesafe.ai) 註冊，再從 [console.typesafe.ai](https://console.typesafe.ai) 產生一把。目前是 early access

金鑰存在瀏覽器的 localStorage，不需要任何設定檔。之後隨時可以在右上角更換

費用以輸入 token 計，每十億個 42 美金。實測一千篇筆記配五十個標籤大約 9M tokens，換算不到台幣二十元

### 為什麼還是要跑一個本機 server

Jev 的 CORS 白名單不收 localhost，瀏覽器直接打它的 API 會在 preflight 就被擋掉，回一句 Disallowed CORS origin。所以請求會先送到自家的 `/api/jev`，由 Vite dev server 轉發出去

金鑰的路徑是這樣

1. 你在畫面上填，存進這台電腦的 localStorage
2. 前端把它放在 `x-typesafe-key` 這個自訂標頭，送到同一台機器上的 `/api/jev`
3. proxy 把它換成正式的 `Authorization`，再轉給 Jev

整段過程金鑰只在你的機器上流動，不會進版控也不會進打包後的檔案

開發時也可以改用環境變數 `TYPESAFE_API_KEY` 當預設值，畫面上沒填時會用它遞補

## 哪些檔案會被處理

只有兩種都成立的才會進判定

- 副檔名是 `.md`，其他一律不讀，連內容都不會打開
- 檔案帶 YAML frontmatter，沒有的跳過（替它憑空生一段出來是在改變檔案的形態，不只是補標籤）

被擋掉的數量會顯示在頂部，不會默默忽略

大 vault 常有附件、匯入暫存這類目錄，裡面也是帶 frontmatter 的 `.md`，但不該進判定：它們會污染標籤字典，也白白吃掉 token

頂部的資料夾按鈕會開出一棵檔案樹，可以展開到任一層逐個排除。排除一個資料夾就連它底下的子資料夾一起排除，子資料夾會顯示成停用。上方可以搜尋，底部即時顯示納入幾篇。設定依 vault 記在瀏覽器裡，下次打開還在

排除資料夾或調整標籤門檻都不會重讀檔案，也不會丟掉已經跑出來的判定，結果會依路徑與標籤對位搬到新的矩陣上

## 它做什麼

矩陣的一列是一篇筆記，一欄是一個標籤，每一格是 Jev 給的 0 到 1 機率，這個數字同時代表答案與確定程度

格子畫成結點，帶三重編碼：顏色與大小都跟著信心走，形狀說明這一格的來歷

| 結點 | 意思 |
| --- | --- |
| 實心圓 | 原本沒有，信心高，自動加上 |
| 虛線圓 | 落在審核區間，等你決定 |
| 空心方框 | 原本就有，AI 也同意，維持 |
| 實心方塊 | 原本有，但 AI 認為不該有，建議廢棄 |
| 小點 | 兩邊都認為不該有 |

人工決定過的結點會多一圈外環，跟 AI 的判定分得開

顏色與大小編碼同一個量是刻意的冗餘，掃視時兩個訊號互相加強，辨色有困難時也還讀得出強弱

新增標籤是低風險的，信心夠就自動做。移除既有標籤是破壞性的，一律只提建議，要你點頭才會動

三種調整粒度

- 整批：把整個審核區間一次採納或退回
- 整欄：點標籤名整欄採納，按住 alt 點整欄退回
- 單格：點一下採納，再點退回，第三次回到未決定

按下開始判定之後，結果會跟著螢幕刷新一格一格長到矩陣上，不必等整批跑完才看到

矩陣本身每一幀都畫，但統計數字、待寫入清單與分布圖要掃過整張矩陣，幾十萬格跟著每幀重算會卡死，所以那些刻意跑得慢一點（每 300 毫秒）

底部是判定值的分布，兩個門檻就畫在上面，拖動把手或用方向鍵就能切。門檻設多少一直是憑感覺的事，看得到分布就不必猜：直方圖用對數高度，不然接近 0 的那一大坨會把高信心的尾巴壓扁到看不見

門檻是純前端重算的，拉動它不會重打 API

右側欄回答兩個問題：按下寫入會動到什麼（待寫入按標籤分組，逐篇清單在上千篇時讀不完，但投資這個標籤要加到 6 篇是一眼能判斷的尺度），以及做過的事情怎麼收回

## 寫回之後

每次寫入都會在 vault 的 `.tag-system/` 留下兩樣東西

- `snapshots/<id>.json`：受影響筆記的完整原文
- `ledger.json`：這次加了哪些標籤、移除哪些

所以事後有兩種反悔方式，下方的紀錄列表各有一顆按鈕

- 廢棄標籤：只收回那一次加的標籤，你事後自己改的內容保留
- 回滾快照：把那幾篇筆記整份還原成當時的樣子，事後的修改會一起被蓋掉

`.tag-system/` 是點開頭的目錄，Obsidian 預設會忽略

## 設計上幾個刻意的選擇

寫回時只替換 frontmatter 的 `tags` 欄位，其餘位元組原封不動，所以沒有用 gray-matter 這類會整份重新序列化 YAML 的工具，而是自己寫了一層薄的讀寫

回滾靠的是整份原文的快照，不依賴差異計算是否正確

判定時每篇筆記發一次請求，所有標籤在同一個請求裡平行評估，所以請求數等於筆記數而不是筆記數乘標籤數。標籤多到裝不下 context 時會自動切批

送去判定的 state 只帶標題、路徑、既有標籤與裁切過的內文，因為 Jev 的已知弱點之一是 state 塞太多無關內容反而會拉低判定品質

## 開發

```bash
npm test          # 單元測試
npm run typecheck
npm run smoke     # 對 fixtures/demo-vault 跑完整流程，會真的打 Jev
```

`npm run smoke` 把 File System Access API 換成 Node 的 fs，其餘走的都是正式程式碼，用來確認判定品質、成本，以及寫入和回滾是否正確。它是直接打 Jev 的，所以要先 `export TYPESAFE_API_KEY=...`

### 金鑰相關的錯誤怎麼看

Jev 這兩個狀態碼意思不同，介面上會翻成人話

| 狀態 | 意思 |
| --- | --- |
| 403 | 完全沒帶金鑰，通常是還沒填 |
| 401 | 金鑰有帶但無效，填錯或已被撤銷 |

核心邏輯都在 `src/core/`，全部是純函式且有測試涵蓋。`src/fs/` 是瀏覽器的檔案存取，`src/jev/` 是判定層，`src/ui/` 是介面

## 首頁的相容標籤動畫

滑過或用鍵盤聚焦相容筆記軟體的標籤時，會炸開一圈星芒，標籤本身微微浮起並發光

星芒是 Lottie，`src/ui/sparkle.json` 由 `scripts/make-sparkle.mjs` 產生，要調整星芒數量、節奏或顏色就改那支腳本再跑一次

```bash
node scripts/make-sparkle.mjs
```

九個標籤共用一個 Lottie 播放器，滑到哪個就把畫布搬過去，不會開九份。播放器用的是 `lottie_light`，只支援 shape layer，比完整版小很多，但仍然讓打包後的體積增加約 50 KB（gzip）

系統設定為減少動態時，位移與星芒都會關掉，只留顏色變化

## 部署到線上

這個專案本身跑在 <https://mukiwu.github.io/vault-tag-system/>，轉發層是 `https://vault-tag-proxy.mukispace.workers.dev`。要自己架一份的話照下面走


線上版沒辦法只靠靜態網站跑起來。Jev 的 CORS 白名單不收外部網域，瀏覽器直接打它的 API 會在 preflight 就被擋掉，所以一定要有一層轉發。本機開發時這件事由 Vite dev server 代勞，線上版靠一支 Cloudflare Worker

這支 Worker 刻意不保存任何金鑰。金鑰由使用者自己填、存在自己的瀏覽器，隨請求放在 `x-typesafe-key` 標頭送過來，Worker 只負責換成正式的 `Authorization` 再轉出去。所以部署的人不會替訪客付 Jev 的帳

### 部署轉發層

先改 `wrangler.jsonc` 裡的 `ALLOWED_ORIGINS`，把自己的 GitHub Pages 網址填進去。少了這道，這支 Worker 會變成任何人都能用的免費通道

```bash
npx wrangler login
npx wrangler deploy
```

部署完會拿到一個 `https://<name>.<account>.workers.dev` 的網址

### 接上前端

到 GitHub repo 的 Settings，Secrets and variables，Actions，Variables 分頁，新增一個名為 `JEV_ENDPOINT` 的變數，值就是上面那個 Worker 網址

再到 Settings，Pages，把 Source 設成 GitHub Actions。之後推到 `main` 就會自動建置與部署

沒有設定 `JEV_ENDPOINT` 的話，線上版首頁會直接標明判定不可用，不會讓人填完金鑰才撞牆

### 本機驗證 Worker

```bash
npx wrangler dev
```

再把 `.env.local` 的 `VITE_JEV_ENDPOINT` 指向 `http://localhost:8787`，就能用本機的 Worker 測整條路徑

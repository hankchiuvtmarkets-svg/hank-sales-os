# Hank Sales OS

Hank 個人使用的 AI Sales Agent，聚焦日本、韓國、香港、澳門市場的 EA 開發者、交易社群主、IB、金融內容創作者與潛在交易客戶。

系統只搜尋公開網頁、建立 CRM 名單與產生待批准草稿。**不會自動發送第一封陌生私訊**，也不會登入社群帳號、繞過平台限制或抓取私人資料。

## 目前狀態

可用：

- 靜態 CRM、今日工作台、客戶雷達、成交漏斗與本機訊息助手
- LocalStorage 客戶資料、JSON 匯出與匯入
- Supabase 健康檢查與 `agent_settings` 實際讀取
- OpenAI 韓文／日文搜尋策略產生
- Tavily 公開網頁搜尋
- URL 正規化、全域重複 URL 排除、同平台帳號與 lead 去重
- 文章、貼文、搜尋頁、標籤頁與無效社群結果排除
- AI 背景分析、痛點、合作分數與韓／日文破冰草稿
- `search_runs`、`search_results`、`leads`、`message_drafts`、`activities` 完整寫入流程
- 每日搜尋次數與估算成本上限
- 外部 API／資料庫錯誤的結構化 server log 與 run log
- 前端讀取雲端 leads、最近執行、結果數、新客戶數、失敗原因與待批准草稿
- 單一登入保護加密名單、雲端 CRM 與訊息草稿；登入後不再重複要求 token／解鎖碼
- Vercel 每日排程（`01:00 UTC`，台北時間 `09:00`）
- 無 API key 備援：ChatGPT 每日公開網頁研究後更新 `data/auto-leads.json`，首頁直接顯示目標客戶

仍需外部設定後才可用：

- 真正的每日 Agent：需要 `OPENAI_API_KEY` 與 `TAVILY_API_KEY`
- 即時 OpenAI＋Tavily 搜尋按鈕：需要完成 Supabase schema 並設定兩個 provider API keys；未設定時自動使用安全排程備援
- Supabase 新欄位與安全設定：需要先執行最新版 `supabase/schema.sql`
- LocalStorage 手動名單目前仍保留在瀏覽器；本階段只把 AI 找到的雲端 leads 以唯讀方式合併顯示，避免在公開前端直接開放 service-role 寫入
- 尚未接任何訊息平台官方 API，也沒有自動發訊息功能

## 架構

```text
Vercel Cron
  -> /api/cron-discover
  -> /api/run-agent
      -> OpenAI：產生韓／日文搜尋策略
      -> Tavily：搜尋公開網頁
      -> 本機規則：正規化、去重、排除文章頁
      -> OpenAI：分析、評分、產生草稿
      -> Supabase：run/result/lead/draft/activity

Browser Dashboard
  -> LocalStorage：既有手動 CRM
  -> 單一登入
  -> /api/agent-status + /api/cloud-leads
  -> Supabase 雲端結果（唯讀顯示）
  -> /data/auto-leads.json（加密自動名單）
```

### 每日零金鑰名單

`data/auto-leads.json` 是 AES-256-GCM 加密後的研究資料。安全排程輪替日本、韓國、香港、澳門的目標類型，產生當地語言搜尋策略、搜尋公開頁面、去除文章與重複帳號、分析痛點與合作可能性，再加密更新這個檔案。加密內容另外保留最多 2,000 個已辨識對象與最近 90 次搜尋紀錄；即使某位對象沒有進入目前的高分名單，之後再次出現仍會被辨識為舊對象。首頁可用市場按鈕分流顯示。使用者只需登入一次，瀏覽器便會直接解密顯示；公開 repo 不會暴露目標帳號、評分、痛點或破冰草稿。

這條路徑只保存公開帳號與商務研究，不保存私人聯絡資料，也不發送訊息。Supabase／OpenAI／Tavily 後端仍完整保留，日後設定 API keys 後可作為更高頻率的第二條管線。

主要程式：

- `lib/agent.js`：完整 Agent orchestration 與成本／搜尋限制
- `lib/providers.js`：OpenAI、Tavily client 與 provider error
- `lib/normalization.js`：URL、帳號、平台判斷與候選頁過濾
- `lib/repository.js`：所有 Supabase 讀寫
- `lib/server.js`：Supabase client、Cron/Dashboard authorization
- `scripts/auto-feed-merge.js`：自動名單永久去重、首次／最近發現與搜尋歷史
- `supabase/schema.sql`：可重複執行的 canonical schema／migration
- `index.html`：現有 CRM 與雲端狀態介面

## API

| Route | Method | Authorization | 用途 |
|---|---:|---|---|
| `/api/health` | GET | 無 | Supabase 與環境變數布林狀態，不回傳 secret |
| `/api/discover` | POST | `Bearer CRON_SECRET` | 只產生並保存搜尋策略，不執行搜尋 |
| `/api/run-agent` | POST | `Bearer CRON_SECRET` | 執行完整 Agent 流程 |
| `/api/manual-run` | POST | 單一登入 | 「開始持續搜尋」的即時執行入口；缺 provider keys 時切換安全排程備援 |
| `/api/cron-discover` | GET/POST | `Bearer CRON_SECRET` | Vercel Cron 入口 |
| `/api/agent-status` | GET | 單一登入 | 執行狀態、限制與待批准草稿 |
| `/api/cloud-leads` | GET | 單一登入 | 讀取雲端 leads |
| `/api/pending-drafts` | GET | 單一登入 | 讀取待批准草稿 |

任何 API 都沒有「發送訊息」動作。

## Supabase

在 Supabase SQL Editor 執行整份 [`supabase/schema.sql`](supabase/schema.sql)。SQL 使用 `create ... if not exists` 與 `alter ... add column if not exists`，可用來升級既有資料表，不會刪除現有資料。

資料表：

- `agent_settings`：開關、市場、目標、每日限制
- `search_runs`：開始／完成時間、狀態、數量、成本估算、失敗原因、logs
- `search_results`：原始 URL、canonical URL、候選判斷與排除原因
- `leads`：正規化帳號、背景、痛點、分數與來源
- `message_drafts`：只建立 `pending_approval` 草稿
- `activities`：lead discovery 與後續活動紀錄

所有資料表會啟用 RLS；serverless API 使用 Vercel 內的 service role key。不要把 service role key 放到前端或 GitHub。
Schema 也會明確授權上述六張表給 `service_role`，但不會授權瀏覽器的 `anon` 角色直接讀取 CRM。

## Vercel Environment Variables

必要：

| 變數 | 說明 |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 僅限 Vercel server-side |
| `APP_URL` | 例如 `https://hank-sales-os.vercel.app` |
| `CRON_SECRET` | Vercel Cron 與 Agent API 的 server secret |
| `DASHBOARD_TOKEN` | 選填；只有啟用 Supabase 私密 CRM／即時付費搜尋 API 時需要放在 Vercel，網站不再另外顯示 token 輸入框 |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | 預設 `gpt-5-mini` |
| `TAVILY_API_KEY` | Tavily Search API key |

限制（已有安全預設，可選擇在 Vercel 覆寫）：

| 變數 | 預設 | 說明 |
|---|---:|---|
| `DAILY_SEARCH_LIMIT` | `6` | 每日最多 Tavily 搜尋次數 |
| `DAILY_COST_LIMIT_USD` | `1.00` | 每日估算成本上限 |
| `MAX_RESULTS_PER_QUERY` | `5` | 每個 query 最多結果 |
| `MIN_LEAD_SCORE` | `55` | 建立 lead 的最低分 |
| `OPENAI_RESERVE_PER_CALL_USD` | `0.05` | 每次 OpenAI call 的預算保留值 |
| `TAVILY_COST_PER_SEARCH_USD` | `0.01` | 每次搜尋的估算值 |
| `OPENAI_INPUT_COST_PER_MILLION_USD` | `0.25` | token 成本估算參數 |
| `OPENAI_OUTPUT_COST_PER_MILLION_USD` | `2.00` | token 成本估算參數 |
| `OPENAI_MAX_OUTPUT_TOKENS` | `2000` | 每次 AI 回覆的輸出 token 上限 |

成本上限是根據 provider 用量與上述估算值做的應用層保護；帳務仍以 OpenAI/Tavily 控制台為準。也建議在兩個 provider 後台另外設定 hard budget／usage alert。

不要把任何真實 secret 寫入 `.env.example`、GitHub、前端程式或 issue。

## 本機驗證

需求：Node.js 20+。

```bash
npm install
npm run check
```

`npm run check` 會執行：

- 所有 API、library、test 與 script 的 JavaScript syntax check
- `index.html` inline JavaScript parse check
- URL 正規化與候選頁過濾測試
- OpenAI JSON parse 測試
- 完整 strategy → search → result → lead → draft → activity 流程測試
- 重複 lead、每日限制、health 與 schema consistency 測試

測試不會呼叫真實 OpenAI、Tavily 或 Supabase，因此不需要本機 secret，也不會產生成本。

## 部署順序

1. 在 Supabase SQL Editor 執行最新版 `supabase/schema.sql`。
2. 在 Vercel Project Settings → Environment Variables 新增缺少的變數。
3. 重新部署 Production，讓新增／更新的環境變數生效。
4. 開啟 `/api/health`，確認 `ok: true` 且 `agentSettingsRows` 至少為 `1`。
5. 開啟首頁並登入一次；登入資料保存在該瀏覽器，之後直接顯示名單。
6. 按「開始持續搜尋」。有 OpenAI／Tavily keys 時立即執行；尚未設定時由安全排程持續更新。

Vercel 會由 `vercel.json` 在每日 `01:00 UTC` 呼叫 `/api/cron-discover`。

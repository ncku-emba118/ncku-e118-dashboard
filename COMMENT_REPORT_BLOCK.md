# 留言檢舉／封鎖審查修正（2026-10-03）

專案 `/Users/aqualux/Code/e118-dashboard`，分支 `feat/comment-report-block`。本輪僅修改六項審查範圍的本機檔案，保留接手時未提交改動；沒有 git 寫入、commit、push、部署、讀 `.env`、連線資料庫或執行 SQL。

## 本輪改動檔案與行號

| 檔案：行號 | 修正 |
| --- | --- |
| [moderation-config.ts:6](lib/comments/moderation-config.ts#L6)、[moderation.ts:11](lib/comments/moderation.ts#L11) | 補英文／中文辱罵、字尾、重複字母、leet、妳→你；精確處理正常片語例外。 |
| [Comments.tsx:109](components/Comments.tsx#L109) | 檢舉 10 秒逾時、取消、卸載中止、晚到回覆隔離；封鎖與解除封鎖不受檢舉 pending 影響；404 本機隱藏。 |
| [admin/page.tsx:373](app/board/admin/page.tsx#L373) | 首頁顯示待處理檢舉 N、待審留言 M，連至 `/board/admin/reports`，限可管理部門。 |
| [comments/[id]/route.ts:108](app/api/board/comments/[id]/route.ts#L108) | 放行與刪除寫入 comments 既有 reviewed_by／reviewed_at；駁回與刪除結案寫入 reports 同名欄位，身分取自 session.sub。 |
| [0030_comment_reports.sql:15](supabase/migrations/0030_comment_reports.sql#L15) | 僅在尚未套用的 0030 新增 reports 審查人 FK／時間欄位；comments 權限、policy、publication 都不動。 |
| [contact.ts:1](lib/comments/contact.ts#L1) | 公開信箱維持已設定的 `chengchieh.huang@gmail.com`，更新過時註解。 |
| [moderation.test.ts:36](lib/comments/moderation.test.ts#L36) | 所有指定正反例、leet、字尾及例外重疊回歸；保留原測試。 |
| [components.test.ts:183](lib/comments/components.test.ts#L183) | pending、逾時、重試、取消、卸載、body pending、404／storage 失敗及晚到回覆測試。 |
| [admin-counts.test.ts:1](lib/comments/admin-counts.test.ts#L1) | 部門／super／空部門、精確 count、錯誤／null 不冒充 0 與管理連結測試。 |
| [migrations.test.ts:35](lib/comments/migrations.test.ts#L35) | 新審查欄位、禁止變動 comments 權限與 publication 的靜態合約。 |
| [route.test.ts:53](app/api/board/comments/[id]/route.test.ts#L53)、[approve.test.ts:24](app/api/board/comments/[id]/approve.test.ts#L24) | 更新審查人／時間斷言，補 DELETE lookup 與更新的留言 ID 核對。 |
| [COMMENT_REPORT_BLOCK.md:1](COMMENT_REPORT_BLOCK.md#L1) | 更新公開信箱、規則、計數、套用順序與本輪驗證。 |

## 過濾詞庫與規則

- `POST /api/board/comments` 原有流程維持：內容及署名命中則存 `pending_review`，不公開、不推播，不回傳命中詞；原 URL spam 過濾維持。
- 唯一詞庫為 `lib/comments/moderation-config.ts`。補上 `idiot / stupid / dick / slut / whore / retard / stfu / kill yourself / kys` 及「靠夭、雞歪、笨蛋、垃圾、廢物、腦殘、北七、三小、媽的、去你的」。
- NFKC、轉小寫、簡繁對應、妳→你。中文仍採片語，不將「干」「甘」全面改為「幹」；僅獨立開頭的指定辱罵片語保留替字別名。
- 英文保留 Latin／數字左右邊界，明列各詞根常見字尾（ed／s／ing／in／er／head 等）及 `fuckyou`，避免 Scunthorpe／Dickinson／shitake 被詞根子字串誤傷。
- 保留原字串與連續重複英文字母壓縮後的比對路徑，例如 `fuuuck → fuck`；兼顧既有 `N.I.G.G.E.R` 等分隔字拼寫。
- 額外 leet 路徑：`0→o / 1→i / 3→e / @→a / $→s / v→u`；夾在英文字母間的 `*→u`，可抓 `f*ck / fvck / sh1t`。原路徑保留，不影響中文標點分隔。
- 詞中仍允許空白、標點、符號及零寬字元。
- 正常例外：「心智障礙者、去死角、去死皮、混蛋白、若干你媽媽、shoot you at 3pm、chink in the armor」。僅豁免完全落於例外範圍內的命中，不放過同句其他辱罵或跨例外邊界的「混蛋白痴」。
- 「幹部、幹事、秘書長、干部」及所有指定正常詞有回歸測試。所有指定辱罵均有命中測試。

## 幹部及時處理與審查紀錄

`/board/admin` 每次載入時以 exact count 顯示「待處理檢舉 N、待審留言 M」，連至 `/board/admin/reports`。前者計算 `resolved_at IS NULL` 的檢舉筆數（同留言多筆檢舉各算一筆），後者只計 `pending_review AND deleted_at IS NULL` 留言；都以 session 可管理部門過濾。查詢錯誤或 count 為 null 顯示「待確認」。沒有新增推播／LINE 通知或輪詢，幹部仍需主動開啟／重載首頁並處理。

comments 原本已有 reviewed_by／reviewed_at：放行及刪除沿用。comment_reports 新增同名欄位：駁回及刪除結案寫入，僅更新未結案檢舉；重試不覆寫已結案紀錄。已刪留言重試只補結案，保留原留言刪除／審查人時間。原同源、角色與部門授權維持。

## 檢舉請求與公開聯絡方式

- 檢舉等待超過 10 秒中止，解除送出鎖定，可重試；等待 response body 也計入期限。
- 「取消」與本機「封鎖／解除封鎖」不受 pending 限制。取消、逾時及卸載均作廢 request 身分，晚到結果不覆寫新表單或本機設定。
- 中止客戶端不能保證伺服器尚未收到，提示明示送達待確認；同 reporter ID 重試沿用既有去重。
- API 404 不等待 body，立即本機隱藏並提示留言不存在；不宣稱檢舉已送達。一般錯誤仍不隱藏或假報成功。
- 公開信箱已設定：[chengchieh.huang@gmail.com](mailto:chengchieh.huang@gmail.com)，留言區呈現可點擊 mailto；不是待提供狀態。

## 手動套用順序（本次未執行）

1. 另行取得資料庫變更授權並確認目標、既有 migrations 已至 `0029_class_gate.sql`、**0030 尚未套用**。若任何舊版 0030 已執行，不可直接重跑本檔，需先核對實際 schema。
2. 先套用 [0030_comment_reports.sql](supabase/migrations/0030_comment_reports.sql)。新增 reports（含 reviewed_by／reviewed_at）、結案欄位、唯一鍵、索引、RPC 與僅 service_role 可用的權限。這是單一交易，非重複執行腳本。
3. **0030 不更動 comments 的權限、policy、Realtime publication**。comments 審查欄位已在初始 schema，不新增／重設；報告數量不會自動隱藏留言。
4. 另行取得部署授權後，以 GitHub-first 部署新版，驗證計數、放行／駁回／刪除與審查紀錄；確認舊頁面已重新載入新版。
5. 最後才考慮套用 [0031_comments_tighten_access.sql](supabase/migrations/0031_comments_tighten_access.sql)。本輪完全未修改 0031，仍保留原三項 comments 收權限操作。

0030 到 0031 的過渡期仍有舊 comments 直讀／Realtime 權限，維持原指定相容安排。不得提前套用 0031。

## 本輪驗證與限制

- 基準：43 檔、917 項通過；修正後：**44 檔、1011 項全部通過，新增 94 項**，未刪除既有測試。
- `npm_config_offline=true npx --no-install tsc --noEmit`：通過。
- `npm_config_offline=true npx --no-install vitest run --config /private/tmp/e118-comment-offline/vitest.config.mjs`：通過。
- 隔離 config 匯入原 vitest.config.ts 保留全測試清單，envDir 指向空暫存資料夾；setup 攔截 TCP connect 與未 mock 的 fetch。沒有讀專案 `.env`、資料庫連線或外部網路測試。
- `git diff --check`：通過；git 僅作唯讀核對。TypeScript 會更新既有的本機增量快取 tsconfig.tsbuildinfo，非功能原始碼。
- 全套輸出：[測試 log](/private/tmp/e118-comment-final-tests.log)、[typecheck log](/private/tmp/e118-comment-typecheck.log)；暫存證據可能被系統清理。
- 實際元件離線轉譯及事件測試已執行，已產生 [後台 HTML](/private/tmp/e118-comment-offline/admin.html) 與 [留言 HTML](/private/tmp/e118-comment-offline/comments.html)。瀏覽器安全政策拒絕 file://，未完成畫面／真機驗證，不宣稱視覺 QA 通過。
- 三方獨立審查：資安未找到新增越權／洩漏；可靠性發現例外遮蔽跨界辱罵，已修正並獨立複測；測試覆蓋發現 DELETE ID 斷言缺口，已補強。
- SQL 僅靜態合約，未證明實際 PostgreSQL／RLS／PostgREST 執行；待另行授權隔離環境驗證。
- 關鍵字無語意能力，同音字、創意拼法及語境誤判仍可能存在。匿名封鎖仍依既有 IP hash，共用網路可能連帶封鎖；本機隱藏不跨裝置同步，storage 失敗只保留當頁。

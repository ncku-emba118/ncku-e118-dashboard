# E118 原生推播（FCM 主題訂閱）

分支：`feat/native-push`。對應 App 專案 `~/Code/e118-emba-app`（`docs/native-push.md`）。
**預設關閉**：`NATIVE_PUSH_ENABLED` 不是 `true` 時，dispatcher 完全不碰原生通道。

## 1. 運作方式

```
[App 殼內 /board 通知區塊（NativePushOptIn）]
  站內繁中說明頁 → 使用者按「同意並開啟」→ 系統授權 → FirebaseMessaging.getToken()（啟動 FCM，回傳值丟棄）
  → subscribeToTopic('e118_all')           ← 不建 token 資料庫、不存任何裝置識別碼
  關閉：unsubscribeFromTopic + deleteToken

[新公告 post_published → lib/push/dispatcher.ts]
  Web Push 逐訂閱發送（既有行為）
  ＋ 並行：lib/push/native/ 以 FCM HTTP v1 對主題 e118_all 發一則（message.topic，無 token）
  點擊通知 → data.url（站內路徑，NativePushBridge 以 safeInternalPath 再驗一次）→ 導向公告
```

- 主題：`e118_all`（`lib/push/native/types.ts` 的 `TOPIC_ALL`）。擴充方式（本次未實作）：`e118_dept_<代碼>`，
  `buildTopicMessage(content, topic)` 已支援傳入其他主題（名稱須符合 `[a-zA-Z0-9-_.~%]+`）。
- 與 Web Push **不去重**（2026-10-13 Codex 審查後調整）：單靠 `user_agent` 無法證明該裝置已訂閱原生主題，排除會讓尚未訂閱者漏收；App 殼內本來就不會建立新的 Web Push 訂閱，重複機率極低。
- 發送時間預算：`NATIVE_PUSH_BUDGET_MS` 是整次原生發送（含換權杖、401 重試、讀回應）的總上限。OAuth 端點固定為 Google 官方網址，忽略金鑰 JSON 內的 `token_uri`。
- **不寫資料庫、無 SQL**：原生發送結果只用 console log（`[push.dispatcher.native_sent|native_failed|native_skipped]`，Netlify Functions 日誌可查）。
  `push_log` 沒有 native 欄位，原生通道不計入 `total_subscribers／sent_count`。原生發送失敗**不**影響 job 狀態、不重試（避免 Web Push 重複送出）。
- 舊版 App（沒有 `FirebaseMessaging` 外掛）：`window.Capacitor.Plugins.FirebaseMessaging` 不存在 → 自動退回原本「請透過班級 LINE 群組」說明。
- 取得外掛的方式（查證來源：`@capacitor/ios`、`@capacitor/android` 8.5.2 的 `JSExport`，原生層把每個已註冊外掛注入成 `window.Capacitor.Plugins.<jsName>`；
  `@capacitor-firebase/messaging` 8.5.2 的 jsName／plugin name 為 `FirebaseMessaging`，方法含 `subscribeToTopic`、`unsubscribeFromTopic`、`getToken`、`deleteToken`、`createChannel`）。
  **實機尚未驗證**遠端網站實際看到的鍵名，列入驗收項目。

## 2. 環境變數（只列名稱；值放 1Password `AI-agent` → Netlify）

| 名稱 | 說明 |
|---|---|
| `NATIVE_PUSH_ENABLED` | 預設 `false`；設 `true` 才啟用原生通道與 Web Push 去重 |
| `FCM_PROJECT_ID` | Firebase 專案 ID |
| `FCM_SERVICE_ACCOUNT_JSON_B64`（或 `FCM_SERVICE_ACCOUNT_JSON`） | 發送用服務帳號 JSON（最小權限：僅 FCM 發送） |
| `NATIVE_PUSH_BUDGET_MS`（選填） | 原生通道時間預算，預設 5000 |

已移除：`APNS_*`（iOS 改由 Firebase 轉送 APNs，`.p8` 上傳到 Firebase Console，不放 Netlify）。

## 3. 上線順序

1. 使用者完成 App 端待辦（見 App 專案 docs：Firebase 註冊 iOS／Android App、放設定檔、APNs `.p8` 上傳 Firebase）。
2. **新版 App 打包上架**（內含 `@capacitor-firebase/messaging`）。
3. 部署本分支網站程式（此時 `NATIVE_PUSH_ENABLED` 未設 → 行為與以前相同，新版 App 內通知區塊已可使用）。
4. Netlify 設 `FCM_PROJECT_ID`、`FCM_SERVICE_ACCOUNT_JSON_B64`。
5. 設 `NATIVE_PUSH_ENABLED=true`；發一則測試公告，查日誌 `native_sent`，實機驗收（iOS TestFlight、Android 13+ 與 12 以下）。

緊急關閉：把 `NATIVE_PUSH_ENABLED` 改回 `false`（或刪除）即可，下一則公告起不再發原生通知，Web Push 不受影響。

## 4. 手動發送

- 程式：可用 `lib/push/native` 的 `sendNativeTopic`／`FcmClient.sendToTopic`（需服務帳號），或直接呼叫 FCM HTTP v1 `messages:send`，body 為 `{"message":{"topic":"e118_all", ...}}`（見 `scripts/native-push-dry-run.ts` 印出的範例）。
- Firebase Console → Messaging（雲端通訊）→ Notifications composer：**待確認**能否直接選「主題」作為目標。
  查證（2026-10-07，firebase.google.com `send/firebase-console`）：官方頁只寫目標欄位為 **User segment**（依 App、版本、語言、使用者屬性等），
  並說明 composer 的部分欄位不等同於 API；`topic-messaging` 頁只提到 composer 用於「audiences or user segments」的 fanout，**未明確記載可選 topic**。
  因此不得假設可行；請使用者實際進 Console 確認，不行就改用上面的 HTTP v1 方式。

## 5. 本機驗證

```
npx tsc --noEmit
npx vitest run                          # 含 lib/push/native/native.test.ts、lib/native-push-client.test.ts
npx tsx scripts/native-push-dry-run.ts  # 假金鑰、不連外：驗 topic payload
npm run build
```

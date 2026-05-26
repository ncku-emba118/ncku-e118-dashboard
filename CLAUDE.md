# E118 Dashboard — 修改規則

此 repo 是 **e118.aqualux.dev 對外 dashboard** 的原始碼。
新增 / 修改系統入口時必須遵守以下架構，確保視覺與操作一致性。

---

## 1. Card 結構 — 每張卡片必備元素

每張系統入口卡片（`.app-card`）必須完整包含這 6 個元素，缺一不可：

```html
<a href="<目標站 URL>"
   class="app-card"
   data-help="<help-key>">

  <div class="app-icon">
    <svg ...>(lucide 風格 line icon, 24x24 viewBox, stroke 1.6)</svg>
  </div>

  <button type="button"
          class="app-help"
          data-help-btn="<help-key>"
          aria-label="查看「<中文標題>」操作說明">?</button>

  <div class="app-arrow">
    <svg ...>(右上箭頭, hover 才顯示)</svg>
  </div>

  <div class="app-title"><中文標題></div>
  <div class="app-meta"><1 句中文短說明></div>
  <div class="app-domain"><顯示用網域></div>
</a>
```

**`<help-key>` 規則**：英文 kebab-case，跟子網域同名（例：`reports` / `field-study`），同卡片的 `data-help` 與按鈕的 `data-help-btn` 必須一致。

**點擊行為（target 規則）**：

- 內部子站（`*.e118.aqualux.dev` / `emba.aqualux.dev/*`）→ **不加** `target` / `rel`，預設同視窗切換，user 可按返回鍵回 dashboard
- 外部服務（Google Drive、Notion、Sheets 等第三方）→ **加** `target="_blank" rel="noopener noreferrer"`，避免污染 dashboard history
- popover 內「開啟系統」連結會在 JS 自動跟卡片同步：卡片有 target 就是 `↗`（新分頁）、無 target 就是 `→`（同窗），不需手動維護

---

## 2. Help Popover 內容 — 必填欄位

`<script>` 內 `HELP` 物件每個 entry 必須完整：

```js
'<help-key>': {
  title:  '<中文標題>',           // 與卡片 .app-title 一致
  domain: '<顯示網域>',           // 與卡片 .app-domain 一致
  desc:   '<1-2 句說明用途與定位>',
  steps:  [
    '<步驟 1>',
    '<步驟 2>',
    '<步驟 3>',
    '<步驟 4>',
    '<步驟 5>',                  // 建議 4-5 步
  ]
}
```

**寫作風格**：
- `desc`：先講「這是什麼」再講「為什麼存在」
- `steps`：動詞開頭、避免「請」字、口語化但具體
- 不要寫該系統不存在的功能（例如沒有報名就不要寫報名）

---

## 3. 計數一致性 — 增減卡片時要同步

新增 / 移除卡片後必須**同步更新兩處**：

| 位置 | 內容 |
|---|---|
| Hero 區 | `<span class="stat">N Systems Online</span>` |
| Section 標題 | `<span class="count">0N / 0N</span>` |

例如增加到 7 張：`7 Systems Online` + `07 / 07`。

---

## 4. PWA 設定 — 不要動 manifest 與 icon

- `manifest.json` 已配置完成（standalone display、wine theme）
- icon 4 種尺寸（192/512/180/maskable）已生成於 `assets/`
- **新增卡片不需要重生 icon**

如需更換 icon 設計：
```bash
python3 scripts/generate_pwa_icon.py      # 主邏輯 = Variant C heraldic banner
python3 scripts/generate_logo_variants.py # 4 個方向探索（輸出到 _variants/, gitignored）
python3 scripts/mock_iphone_homescreen.py # iOS 桌面 mockup 預覽
```

---

## 5. 本地預覽 — 部署前必先看

依照使用者偏好「部署前必先預覽」：

```bash
cd ~/Documents/成大EMBA/dashboard-prototype
python3 -m http.server 5188
# 開 http://localhost:5188 確認外觀、? popover、PWA 安裝區
```

OK 後再 `git push origin main` 觸發 Netlify 自動 deploy 到 emba.aqualux.dev。

---

## 6. 部署資訊

| 項目 | 值 |
|---|---|
| Repo | `ncku-emba118/ncku-e118-dashboard` |
| Branch | `main` |
| Hosting | Netlify（自動 build on push） |
| Domain | `emba.aqualux.dev` |
| DNS | Cloudflare DNS-only (灰雲)，Netlify Let's Encrypt |

**部署規則**：一律走 git push，不可用 `netlify deploy` CLI（會綁錯 site）。

---

## 7. 設計系統色票（不要更動）

```css
--ncku-wine:      #8B1F2F   /* 主色 / theme color */
--ncku-wine-deep: #6B1622   /* hover、深化用 */
--ncku-gold:      #C9A961   /* 邊框、ribbon、強調 */
--ncku-gold-soft: #E0C896   /* 副標、淡邊 */
--ncku-cream:     #FAF7F2   /* 主背景、PWA splash bg */
--ncku-ink:       #1A1612   /* 主文 */
--ncku-mute:      #8A7F73   /* 次文 */
```

字體：`Cormorant Garamond`（display）+ `Noto Serif TC`（中文標題）+ system body。

---

最後更新：2026-05-25（建立架構規則文件 — 含 ? help popover pattern + PWA Variant C icon）

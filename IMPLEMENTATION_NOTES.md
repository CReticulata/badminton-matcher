# 實作說明（2026-08-05）

依 `spec.md`＋`design.md`（以後者為準）從零實作。本檔記錄架構決策、逐條對照與已知取捨。

## 架構

- **無 vue-router**：三個分頁（場次/參賽者/歷史）用 `ui.view` 切換；分組預覽、對戰顯示、比分輸入為 overlay（`ui.pending` / `ui.live` / `ui.scoring`），流程單向：產生分組 → 預覽（可交換）→ 對戰畫面 → 比分輸入 → 寫入紀錄。
- **狀態**：`src/store.ts` 用 Vue reactivity（未用 pinia，規模不需要）。`data`（players/sessions/matches/overrides）deep watch 自動寫入 localStorage `badminton-matcher:v1`；UI 狀態不持久化（重新整理會離開比賽畫面，但比賽未記分就不會留下紀錄，符合預期）。
- **統計皆為衍生資料**：比賽次數/休息次數一律從 matches 重新計算（`totalStats`/`sessionStats` computed），不另存計數器，天然與歷史一致。

## 核心模組（皆為純函式＋vitest）

### `src/lib/glicko2.ts`
- 標準 Glicko-2（tau 0.5、收斂 eps 1e-6、Illinois 演算法），`updateRating` 通過 Glickman 論文範例（1500/200 → 1464.06/151.52，vol 0.05999，測試鎖定）。
- 一場比賽＝一個 rating period。`applyMatch`：雙打時每人以「對方兩人 rating 平均、RD 平均」為單一虛擬對手，只看勝負；所有人的更新都以賽前快照為基準。單打即標準一對一。
- `recalcAll`：從 initialRating/RD350/vol0.06 起點，把 matches＋手動覆寫事件（overrides）依時間序重播。手動覆寫 rating 存成事件（而非改 initialRating），全量重算後覆寫仍生效且時序正確。

### `src/lib/matchmaking.ts`
- `consecutivePlayCounts`：從同一場次最新一場已完成比賽向前推導每人的連續上場場數；單打與雙打共用，未出現在最新一場者視為 0，不另存持久化計數器。
- `generateRound`：自願休息者先剔除 → 其餘洗牌後依「當日上場次數、連續上場場數」穩定排序（兩者皆並列才隨機）→ 取前 4（單打取 2）上場，其餘＋自願者休息 → `balanceTeams` 在 3 種拆隊法中取兩隊 rating 總和差最小者。公平嚴格優先於強度平衡。
- 測試涵蓋：4/5/8 人、遲到者連打不休息、連續上場優先級、跨單／雙打紀錄、場次隔離、自願休息、人數不足回 null、完全並列隨機性、公平優先於平衡、10 回合模擬的公平不變量（任兩人上場次數差 ≤1）。

### `src/lib/csv.ts`
- 單一 CSV 檔含 `[players]` `[overrides]` `[sessions]` `[matches]` 四區段；名字含逗號/引號有跳脫；陣列欄位以 `|` 連接。匯入為覆蓋還原（UI 有 confirm），round-trip 有測試。

### `src/lib/color.ts`
- 12 色預設盤循環指派；WCAG relative luminance（閾值 0.179）決定黑/白字。

## UI 重點

- 對戰顯示：`MatchDisplay.vue` 全螢幕深底（slate-950）。橫式＝左右各一欄（雙打每欄 2 區塊、單打 1 區塊）＋中央 VS；直式＝上下堆疊＋頂部「建議將手機轉為橫式顯示」。用 Tailwind `landscape:`/`portrait:` variants，名字 `clamp()` 大字、底色即球員代表色、字色依亮度自動黑白。底部顯示休息名單＋「結束比賽・輸入比分」。
- 分組預覽：點第一人選取（黑框）、點第二人交換，A/B 隊與休息名單皆可；統計與 rating 以實際確認開打的分組計算（match 紀錄存的就是最終分組與休息者）。
- 比分：非負整數、不可平手（前端與 store 雙層驗證）、不強制 21 分制。
- 歷史：依活動分群並顯示實際上場者的單場 rating delta；有可靠 opening snapshot 時，改分或刪除只從該活動固定開場狀態重播，且不穿透下一活動。活動內既有 match／override／baseline 事件仍依時間線參與重播；沒有可靠 snapshot 才退回 `recalcAll`。
- 參賽者：新增時依台灣羽球推廣協會分級選 1–18 級（初始 rating 800–2500、每級差 100，預設 8 級／1500）、名字 inline 編輯、色票點擊開任意 color picker、點 rating 數字可手動覆寫（RD 重設 350）；移除採可還原封存，保留歷史與 CSV 關聯並排除於未來活動。
- PWA：`public/manifest.webmanifest`＋`public/sw.js`（install 時 precache `/` 等入口，runtime cache-first 快取同源 GET）。僅 production 註冊，避免干擾 dev。

## 已知取捨／簡化

1. **部署未做**（任務限制明列；design.md 的 Cloudflare Pages 部署待使用者確認後另行執行）。未 `git init`（同上）。
2. **多場地**：design.md 明言第一版不做 UI，資料模型（一回合一場）可擴充。
3. **SW 快取策略最簡**：hashed assets 靠 runtime 快取，首次需連線載入過一次才可離線；符合「最簡 PWA」定位。更新版本時 SW cache 名稱固定 `badminton-matcher-v1`，改版靠 cache-first 對 hashed 檔名自然失效＋入口 HTML 可能吃到舊快取——若日後發現更新不即時，把 fetch 對 navigation request 改 network-first 即可。
4. **手動覆寫的時序**：覆寫存事件、重播於比賽之間，若使用者「先覆寫再修改更早的歷史」會照真實時間軸重播（正確語意）。
5. **編輯歷史僅開放改比分**：改對戰組合＝刪除該場重新打一場的語意，用刪除＋重新記錄即可達成，UI 未做組合編輯器。
6. **瀏覽器實測涵蓋**：新增球員、開場次、產生分組、交換（含休息者）、對戰畫面（橫/直）、平手擋下、記分、rating 更新、歷史改分重算、重新整理持久化。未逐一實測：離場/重新加入按鈕、單打畫面、CSV 按鈕點擊（皆有單元測試或同構程式路徑覆蓋）。

## 測試

`pnpm test`：3 檔 22 測試（glicko2 8、matchmaking 12、csv 2）。

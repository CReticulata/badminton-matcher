# 實作說明

依 `spec.md`＋`design.md`（以後者為準）實作。本檔記錄架構決策、模組職責與已知取捨；領域詞彙定義見 `CONTEXT.md`，重大決策理由見 `docs/adr/`。初版於 2026-08-05 完成，其後隨功能演進更新。

## 架構

- **無 vue-router**：三個分頁（場次/參賽者/歷史）用 `ui.view` 切換；分組預覽、對戰顯示、比分輸入為 overlay（`ui.pending` / `ui.live` / `ui.scoring`），流程單向：產生分組 → 預覽（可交換）→ 對戰畫面 → 比分輸入 → 寫入紀錄。
- **狀態**：`src/store.ts` 用 Vue reactivity（未用 pinia，規模不需要）。`data`（players/sessions/matches/overrides/baselines）deep watch 自動寫入 localStorage `badminton-matcher:v1`；UI 狀態不持久化（重新整理會離開比賽畫面，但比賽未記分就不會留下紀錄，符合預期）。
- **兩種衍生資料的分野**：比賽次數／休息次數一律從 matches 重新計算（`totalStats`/`sessionStats` computed），不另存計數器。**但輪替公平不是這樣算的**——它依賴時間，無法從 matches 反推，所以出席事件本身是權威資料（見下）。
- **壞資料不覆蓋**：localStorage 讀不懂時進入唯讀的 `recoveryState`，原樣保留位元組並停止寫回，由 `RecoveryView.vue` 提供原始匯出。

## 核心模組（皆為純函式＋vitest）

### `src/lib/glicko2.ts`
- 標準 Glicko-2（tau 0.5、收斂 eps 1e-6、Illinois 演算法），`updateRating` 通過 Glickman 論文範例（1500/200 → 1464.06/151.52，vol 0.05999，測試鎖定）。
- 一場比賽＝一個 rating period。`applyMatch`：雙打時每人以「對方兩人 rating 平均、RD 平均」為單一虛擬對手；所有人的更新都以賽前快照為基準。單打即標準一對一。
- **觀測得分不只看勝負**：`performanceScore` 在賽制已知時由比分反推每球勝率 `q̂ = a/(a+b)`，再經 `endpoint-distribution.ts` 換算成勝率餵給 Glicko（15:13 約 0.66）。賽制未知（`legacy-missing`）才退回 1／0——換算需要 target／winBy／cap，缺賽制不得假設規則。
- `recalcAll`／`replayRatings`：把 matches＋手動覆寫（overrides）＋固化基準（baselines）依時間序重播。同 timestamp 時依 match → override → baseline 套用。

### `src/lib/rotation-fairness.ts`
- 輪替公平的權威模型。加入／離場／自願休息／公平期重置／降級修復皆為 append-only 出席事件（`session.attendanceEvents`，帶 `sequence` 保證同毫秒仍有序），可上場在場時間由重播累積，App 關閉或重新整理不暫停。
- `上場率 = 公平期完成場數 ÷ 可上場在場時間`。完成比賽在**開打時**凍結公平期歸屬，事後改比分不移動歸屬。
- 事件無法可靠重播時進入**公平降級**：改用活動總上場次數排序，畫面持續明示，並提供「為全員建立新公平邊界」的修復。降級期間不得偽造上場率歷史。
- 理由見 `docs/adr/0002-event-sourced-play-rate-fairness.md`。

### `src/lib/matchmaking.ts`
- `consecutivePlayCounts`：從同一場次最新一場已完成比賽向前推導每人的連續上場場數；單打與雙打共用，未出現在最新一場者視為 0，不另存持久化計數器。
- `generateRound`：自願休息者先剔除 → 依上場率建立**以最低值錨定、每層涵蓋 +0.5 場／時**的公平層（錨定而非兩兩容差，否則排序非傳遞）→ 洗牌後依「公平層 → 連續上場場數」穩定排序 → 嚴格較優者整群無條件上場 → 名額未滿時，在邊界並列群內**聯合**列舉「誰補位」與「怎麼分隊」，取兩隊 rating 總和差最小者，差距在最佳值 +25 內視為等價並隨機挑 → 組合數超過 10,000 時退回公平排序取前 N 人，不靜默截斷。
- 公平嚴格優先於強度平衡：rating 只在公平條件完全相同後才有發言權。

### `src/lib/endpoint-distribution.ts` / `scoring-format.ts`
- 賽制快照（目標分、需領先分數、分數上限）在每場開打時凍結，比分合法性依該快照判定；不合賽制的比分可強制記錄但 `excludedFromRating`，不計入強度。
- 終局分布為逐球動態規劃，依 (賽制, 每球勝率) memoise；rating 路徑與顯示用的預期分差共用同一份實作。

### `src/lib/level.ts`
- 級數＝Glicko-2 內部量 `mu + 8`：`MU_PER_LEVEL = 1`、`RATING_PER_LEVEL = MU_PER_LEVEL * SCALE`，所以 1 級 = 173.7178 rating、8 級 = 1500。刻意由 mu 導出而非另訂常數——舊版的「每級 100 分」就是這樣悄悄偏離 mu 尺度的。
- 超出 1–18 照實顯示（含負級數），不夾範圍。

### `src/lib/csv.ts`
- 單一 CSV 檔含 `[players]` `[overrides]` `[baselines]` `[sessions]` `[matches]` `[attendance]` 六區段；名字含逗號/引號有跳脫；陣列欄位以 `|` 連接。匯入為覆蓋還原（UI 有 confirm），parse 後驗證跨區段參照，round-trip 有測試。

### `src/lib/persistence.ts` / `migration.ts` / `app-data-normalization.ts`
- 讀取時逐版遷移並正規化。舊資料升級時，**進行中**的活動補一筆遷移時點的公平修復邊界；**已結束**的活動不捏造任何出席事件。遷移不新增 rating 事件、不改變任何 Glicko 結果、不移動活動重播邊界（有專門的非干擾測試鎖住）。

### `src/lib/color.ts`
- 12 色預設盤循環指派；WCAG relative luminance（閾值 0.179）決定黑/白字。

## UI 重點

- 對戰顯示：`MatchDisplay.vue` 全螢幕深底（slate-950）。橫式＝左右各一欄（雙打每欄 2 區塊、單打 1 區塊）＋中央 VS；直式＝上下堆疊＋頂部「建議將手機轉為橫式顯示」。用 Tailwind `landscape:`/`portrait:` variants，名字 `clamp()` 大字、底色即球員代表色、字色依亮度自動黑白。底部顯示休息名單＋「結束比賽・輸入比分」。
- 活動名單：每人顯示「上場率 x.xx/時・今日 N 場」與 `積分（級數）`；活動進行中每分鐘 tick 刷新，scope 銷毀時清掉 timer。次要選單提供個別重置公平期（有確認、比賽中則排定待該場結束才生效），降級時顯示常駐橫幅與修復入口。
- 分組預覽：點第一人選取（黑框）、點第二人交換，A/B 隊與休息名單皆可；統計與 rating 以實際確認開打的分組計算。出席／自願休息等會影響資格的事件會作廢未開打的預覽，純時間經過不會。
- 比分：非負整數、不可平手（前端與 store 雙層驗證）；賽制快照判定合法性，不合者可強制記錄但不計入強度。
- 歷史：依活動分群並顯示實際上場者的單場 rating delta（純 rating，不加級數）；有可靠 opening snapshot 時，改分或刪除只從該活動固定開場狀態重播，且不穿透下一活動。沒有可靠 snapshot 才退回 `recalcAll`。
- 參賽者：新增時依台灣羽球推廣協會分級選 1–18 級（選單只顯示級數與階名，rating 由級數換算：1 級 284、8 級 1500、18 級 3237）、名字 inline 編輯、色票點擊開任意 color picker、點強度可手動覆寫（RD 重設 350）；移除採可還原封存，保留歷史與 CSV 關聯並排除於未來活動。
- PWA：`public/manifest.webmanifest`＋`public/sw.js`（install 時 precache `/` 等入口，runtime cache-first 快取同源 GET）。僅 production 註冊，避免干擾 dev。

## 已知取捨／簡化

1. **多場地**：design.md 明言第一版不做 UI，資料模型（一回合一場）可擴充。
2. **SW 快取策略最簡**：hashed assets 靠 runtime 快取，首次需連線載入過一次才可離線；符合「最簡 PWA」定位。cache 名稱固定 `badminton-matcher-v1`，改版靠 cache-first 對 hashed 檔名自然失效＋入口 HTML 可能吃到舊快取——若日後發現更新不即時，把 fetch 對 navigation request 改 network-first 即可。
3. **手動覆寫的時序**：覆寫存事件、重播於比賽之間，若使用者「先覆寫再修改更早的歷史」會照真實時間軸重播（正確語意）。
4. **編輯歷史僅開放改比分**：改對戰組合＝刪除該場重新打一場的語意，用刪除＋重新記錄即可達成，UI 未做組合編輯器。
5. **公平帶 0.5 場／時 未開放設定**：刻意不做設定項，避免多一個沒有校準依據的旋鈕。
6. **級數刻度未經實測校準**：一級差＝66.1% 勝率（對手 RD 350）是 mu 尺度的定義，不是量測結果。「協會的一級差實際對應多少勝率」需要跨級數對戰資料才能回答。

## 測試

`pnpm test`（vitest run）：24 檔 277 測試。含 `src/lib/__tests__/` 的純函式測試與 `src/*.test.ts` 的 store／掛載元件測試（後者用 `@vue/test-utils` + `happy-dom`）。

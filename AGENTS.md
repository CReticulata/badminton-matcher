# badminton-matcher

羽球對戰分配機是純前端 PWA：公平輪替優先、Glicko-2 強度平衡次之，賽後記分並保存可核對的活動歷史。技術棧為 Vue 3、TypeScript、Vite、Tailwind CSS v4；資料只存在瀏覽器 localStorage（key：`badminton-matcher:v1`），沒有後端。

## Source of truth

- `spec.md`：產品需求。
- `design.md`：目前設計與操作語意。
- `docs/adr/`：已定案的架構決策。
- `docs/features/`：功能級行為與驗收規格。
- `CONCEPTS.md`：專案特有領域詞彙。
- ADR、feature spec 與 `CONCEPTS.md` 共同構成目前的 durable knowledge store；實作、除錯或變更已記錄領域時適合先搜尋這些文件。

文件與程式衝突時，以已測試的目前程式行為為事實，並同步修正文件；不要讓過時文件反向支配程式。

## Architecture

- 演算法純函式位於 `src/lib/`；Glicko-2 由專案自行實作，禁止另引第三方 Glicko 套件或建立第二套 rating 演算法。
- 全域狀態位於 `src/store.ts`，使用 Vue reactivity（非 Pinia）。畫面流程由 `ui.view` 與 overlay 狀態控制，沒有 vue-router。
- `Player.initialRating` 是建立球員時的初始強度，不是一般活動的開場分數。
- 球員移除是可還原封存；封存者不進入未來活動，但歷史、rating replay 與 CSV 關聯必須保留。新增或修改 optional timestamp（例如 `archivedAt`）判斷時必須以 `undefined` 判斷是否存在，不使用 truthiness，因為 `0` 是合法 timestamp。

## Rating 與歷史 invariants

- 活動開始時保存所有已建立球員完整的 Glicko opening snapshot：rating、RD、volatility；UI 顯示值才四捨五入。
- 每個活動的 opening snapshot 是固定 replay boundary。修改或刪除歷史比分時，有可靠 snapshot 就只重播該活動，不穿透下一活動；沒有可靠 snapshot 才退回全歷史 `recalcAll`。
- 活動時間窗內的 match、`RatingOverride`、`RatingBaseline` 都屬 replay event，必須按既定時間順序處理。同 timestamp 時保留 match → override → baseline 的穩定順序。
- 不能只靠 timestamp 判斷跨活動先後；活動開始時間相同時，以 session 建立順序／rank 區分，避免較早活動被重播兩次或修改穿透下一活動。
- match 歸屬以 `sessionId` 為主，已結束活動排除 `match.at > endedAt`；為相容舊資料，不要求 match timestamp 必須晚於 synthetic `startedAt`。
- 舊資料只有在能可靠重建時才建立 opening snapshot。若只能推測參賽者集合、無法還原首次加入順序，保留可靠的單場 delta 與 ending state，但不顯示依加入順序破同分的整日摘要。
- 單場 delta 是「四捨五入後賽後 rating − 四捨五入後賽前 rating」，只顯示實際上場者；缺乏可靠報告時不可用假的 `0` 代替。
- 活動進行中禁止手動覆寫 rating 與封存球員。

## Persistence 與 CSV

- localStorage 寫入失敗不可靜默忽略；全域警告維持到後續成功保存完整目前資料為止。
- CSV schema 擴充必須維持舊欄位缺失時的匯入相容，並 round-trip 保存 opening snapshot、participant reliability、封存 timestamp、override 與 baseline。
- 不可靠舊資料採保守降級：保留原始歷史，不製造看似完整的 snapshot、delta 或摘要。

## Development and verification

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

`pnpm test` 使用 Vitest；`pnpm build` 執行 `vue-tsc -b && vite build`。演算法、store、migration、CSV 或歷史 UI 變更至少要完成：

1. 相關 regression tests；核心行為優先先紅後綠。
2. 完整 `pnpm test`。
3. `pnpm build`。
4. `git diff --check`。
5. 受影響流程的瀏覽器實走；rating history 典型路徑是新增參賽者 → 開活動 → 產生分組 → 記分 → 結束活動 → 查看／修改歷史並核對單場 delta 與整日摘要。

Cloudflare deployment check 與本機 production build 是不同訊號；外部 check 失敗時查 dashboard log，不得以本機 build 成功臆測部署成功。

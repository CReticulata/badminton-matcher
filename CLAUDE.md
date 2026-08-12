# badminton-matcher

全域守則在 ~/.claude/CLAUDE.md，本檔只放專案特有事實。

羽球雙打隊伍產生器：純前端 PWA，打球時自動分組（公平輪替優先、Glicko-2 強度平衡次之）、對戰畫面給大家看、賽後記分。使用者自己與球友真實使用。技術棧 Vue 3 + TypeScript + Vite + Tailwind CSS v4（@tailwindcss/vite plugin，無 config 檔）+ pnpm，資料存 localStorage（key: `badminton-matcher:v1`），無後端。規格在 `spec.md`，設計決策以 `design.md` 為準。

## 關鍵事實
- 開發/測試/build 指令：`pnpm dev` / `pnpm test`（vitest run）/ `pnpm build`（vue-tsc -b && vite build）
- 分支與發版：GitHub `CReticulata/badminton-matcher`，Cloudflare Pages Git 整合——push `main` 即自動建置部署（build: `pnpm build`、output: `dist`），正式站 https://badminton-matcher.creticulata.dev（2026-08-06 上線）
- 演算法純函式在 `src/lib/`（glicko2.ts、matchmaking.ts、csv.ts、color.ts），改動必須跑 vitest；Glicko-2 為自行實作（tau 0.5，論文範例有測試鎖住），禁用第三方 glicko 套件
- 全域 store 在 `src/store.ts`（Vue reactivity，非 pinia）；UI 流程用 `ui.view`＋overlay 狀態，無 vue-router
- 歷史修改/刪除後必呼叫重算流程：有可靠活動快照時從該活動固定開場狀態重播，且不得穿透下一活動邊界；無快照時才使用 `recalcAll`，並納入手動覆寫與固化基準事件

## 驗證方式
`pnpm test` 全綠 → `pnpm build` 零錯誤 → `pnpm dev` 開瀏覽器實走：新增參賽者 → 開場次 → 產生分組 → 開始比賽 → 輸入比分 → 歷史頁改分數確認 rating 重算。

## 踩雷紀錄
- 【2026-08-05】症狀：比分輸入按儲存無反應，console 報 `scoreA.value.trim is not a function`。根因：`<input type="number">` 的 v-model 值可能是 number 而非 string。下次：number input 的 v-model 一律先 `String(v)` 再處理，或用 `v-model.number`＋型別 `string | number`。

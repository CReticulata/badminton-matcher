# badminton-matcher

全域守則在 ~/.claude/CLAUDE.md，本檔只放專案特有事實。

羽球雙打隊伍產生器：純前端 PWA，打球時自動分組（公平輪替優先、Glicko-2 強度平衡次之）、對戰畫面給大家看、賽後記分。使用者自己與球友真實使用。技術棧 Vue 3 + TypeScript + Vite + Tailwind CSS v4（@tailwindcss/vite plugin，無 config 檔）+ pnpm，資料存 localStorage（key: `badminton-matcher:v1`），無後端。規格在 `spec.md`（使用者原始需求，未隨實作更新），設計決策以 `design.md` 為準，領域詞彙見 `CONTEXT.md`，規格變更走 OpenSpec（`openspec/`）。

## 關鍵事實
- 開發/測試/build 指令：`pnpm dev` / `pnpm test`（vitest run）/ `pnpm build`（vue-tsc -b && vite build）
- 分支與發版：GitHub `CReticulata/badminton-matcher`，Cloudflare Pages Git 整合——push `main` 即自動建置部署（build: `pnpm build`、output: `dist`），正式站 https://badminton-matcher.creticulata.dev（2026-08-06 上線）
- 演算法純函式在 `src/lib/`（glicko2、matchmaking、rotation-fairness、endpoint-distribution、scoring-format、level、rating-history、persistence、app-data-normalization、migration、csv、color），改動必須跑 vitest；Glicko-2 為自行實作（tau 0.5，論文範例有測試鎖住），禁用第三方 glicko 套件
- 輪替公平以**上場率**（公平期完成場數 ÷ 可上場在場時間）分層，不是總上場次數；權威資料是 append-only 出席事件，`rotation-fairness.ts` 重播得出，重播不可靠時進入明示的公平降級。領域詞彙定義在 `CONTEXT.md`，決策理由在 `docs/adr/`
- 級數＝Glicko-2 內部量 `mu + 8`（1 級 = 1 mu = 173.7178 rating，8 級 = 1500）；換算只存在 `src/lib/level.ts`，rating 仍是唯一儲存與計算的量
- 全域 store 在 `src/store.ts`（Vue reactivity，非 pinia）；UI 流程用 `ui.view`＋overlay 狀態，無 vue-router
- 歷史修改/刪除後必呼叫重算流程：有可靠活動快照時從該活動固定開場狀態重播，且不得穿透下一活動邊界；無快照時才使用 `recalcAll`，並納入手動覆寫與固化基準事件

## 驗證方式
`pnpm test` 全綠 → `pnpm build` 零錯誤 → `pnpm dev` 開瀏覽器實走：新增參賽者 → 開場次 → 產生分組 → 開始比賽 → 輸入比分 → 歷史頁改分數確認 rating 重算。

## 踩雷紀錄
- 【2026-08-05】症狀：比分輸入按儲存無反應，console 報 `scoreA.value.trim is not a function`。根因：`<input type="number">` 的 v-model 值可能是 number 而非 string。下次：number input 的 v-model 一律先 `String(v)` 再處理，或用 `v-model.number`＋型別 `string | number`。
- 【2026-08-28】症狀：header 版本號停在舊 commit hash，改 code 也不更新。根因：vite `define` 只在載入設定檔時求值一次，dev server 期間 commit 不會重算（正式 build 無此問題）。下次：dev 版本號帶 `dev` 後綴以資識別；要看最新 hash 就重啟 dev server 或存一次 `vite.config.ts`。
- 【2026-08-28】症狀：離線研究連續四次得出後來被自己推翻的結論——「把分組目標函數換成預期分差」（預期分差對 rating 差單調遞增，單調轉換不移動 argmin，是 no-op）、「候選 C 校準較差」（尺度掃描只到 ×2.0，但兩臂最佳倍率不同，延伸後結論相反）、「Glicko 系統性過度保守」（完全由 beta 決定，CI 下界時方向相反）、「效果 0.2 分」（誤用帶符號分差 `E[a−b]` 而非絕對分差 `E|a−b|`，誇大 5.5 倍）。根因：把依賴未知參數或某個換算選擇的數字，當成確定的結論。下次：任何依賴 beta 或少量資料的判斷，先做三件事再下結論——把參數換成 CI 兩端看方向會不會翻、把掃描範圍拉到轉折之外、把換算基準明確寫出來核對一次。`beta` 的 95% CI 是 `[0.0955, 0.4239]`（跨 4.4 倍，n=29），幾乎任何依賴它的量級結論都需要這道檢查。敏感度分析是必要步驟，不是加分項。
- 【2026-08-28】症狀：比對兩個分支的 markdown，誤判五個檔案「完全相同」，差點丟掉四份仍有價值（其中兩份描述已經是錯的）的文件更新。根因：`git diff | grep -v "^[+-][+-]"` 本意是濾掉 `+++`／`---` 檔頭，但它同時吃掉了 `+- 條列項目`——markdown 的清單新增就是 `+` 後接 `-`。下次：比對檔案差異用 `git diff --numstat` 或 `--stat` 看行數，不要用 grep 過濾 diff 內容。
- 【2026-08-29】症狀：`openspec validate --strict` 通過，但 `openspec archive` 拒絕，報 `target spec does not exist; only ADDED requirements are allowed for new specs`。根因：change 底下的 delta 是**用目錄名判斷目標能力**的。把 `## MODIFIED Requirements`（要改 A 能力）寫進 `specs/B/spec.md` 裡，OpenSpec 會以為要改的是正在新建的 B。下次：一個 change 若同時新增 A 能力並修改 B 能力，要開兩個目錄——`specs/A/spec.md` 放 ADDED、`specs/B/spec.md` 放 MODIFIED。validate 不會抓到這種放錯位置，archive 才會。
- 【2026-08-29】症狀：`openspec archive` 拒絕，報 `current spec contains scenario(s) not present in the modified block`。根因：`## MODIFIED Requirements` 是**整段覆寫**，change 的 delta 沒寫到的既有場景會被靜默丟掉，所以 archive 擋下來。下次：改需求前先把現行 `openspec/specs/<能力>/spec.md` 的場景名稱列出來對照；只是措辭更精確就沿用原名稱（維持 MODIFIED），名稱本身已寫死過時語意才用 `REMOVED` + `ADDED` 換掉整個需求並寫 Reason／Migration。validate 一樣不會抓到，只有 archive 會。
- 【2026-09-05】症狀：Cloudflare Pages deploy 在 `pnpm install --frozen-lockfile` 階段就掛，報 `ERROR packages field missing or empty`，但本機 `pnpm install` 一路正常。根因：根目錄有 `pnpm-workspace.yaml` 只寫 `allowBuilds:`（沒有 `packages` 欄位），CF 那版 pnpm 讀到缺 `packages` 的 workspace manifest 直接報錯；而 `allowBuilds` 在 pnpm 10 根本是無效鍵（有沒有這檔都照樣印 `Ignored build scripts: esbuild`），這檔只有壞處沒有作用。下次：本專案非 monorepo，根目錄不要有 `pnpm-workspace.yaml`；`pnpm approve-builds` 會自動生一個出來，跑完要檢查並刪掉，真需要 pnpm 設定就寫進 package.json 的 `pnpm` 欄位。

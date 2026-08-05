# badminton-matcher 羽球對戰分配機

打羽球時自動分組的純前端 PWA：公平輪替優先、強度平衡次之，對戰畫面直接給大家看，賽後記分並用 Glicko-2 追蹤每個人的強度。

正式站：<https://badminton-matcher.creticulata.dev>

## 功能

- **自動分組**：依當回合出席人數自動排出場與休息名單，休息次數盡量均等（公平輪替優先），再讓兩隊強度盡量接近
- **對戰畫面**：手機橫式四分割顯示兩隊對戰組合，每位參賽者有自訂代表色
- **計分與強度**：賽後輸入比分，以自行實作的 Glicko-2 更新強度分數
- **手動調整**：自動分組後仍可手動換人，數據照手動結果計算
- **自願休息**：可標記本回合跳過某人
- **歷史紀錄**：可回頭修改或刪除比分，系統會全量重算所有 rating 保持一致
- **CSV 匯出／匯入**：紀錄可存成 CSV 帶走或還原

## 技術棧

Vue 3 + TypeScript + Vite + Tailwind CSS v4，無後端，資料存 localStorage（key: `badminton-matcher:v1`）。套件管理用 pnpm。

- 演算法純函式在 `src/lib/`（`glicko2.ts`、`matchmaking.ts`、`csv.ts`、`color.ts`），皆有 vitest 測試
- 全域 store 在 `src/store.ts`（Vue reactivity，非 pinia），UI 流程用 `ui.view` 切換，無 vue-router
- 規格見 `spec.md`，設計決策以 `design.md` 為準

## 開發

```bash
pnpm install
pnpm dev      # 開發伺服器
pnpm test     # vitest run
pnpm build    # vue-tsc -b && vite build
```

## 部署

GitHub push `main` 後由 Cloudflare Pages Git 整合自動建置部署（build: `pnpm build`、output: `dist`）。

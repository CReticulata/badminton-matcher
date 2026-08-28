## 1. Remove the dead module

- [x] 1.1 Confirm nothing in `src/` imports `expected-margin` outside its own tests, and that `endpoint-distribution.ts` does not depend on the calibration coefficient.
- [x] 1.2 Delete `src/lib/expected-margin.ts` and `src/lib/__tests__/expected-margin.test.ts`.
- [x] 1.3 Confirm the assertion that `matchmaking.ts` imports neither module still exists in the performance-score suite.

## 2. Verify

- [x] 2.1 Run `pnpm test` and record the real file and test counts.
- [x] 2.2 Run `pnpm build` and confirm both steps exit zero.
- [x] 2.3 Run `git diff --check`.
- [x] 2.4 Run `openspec validate remove-preview-balance-readout --strict --no-interactive`.
- [x] 2.5 Confirm the remaining `calibrated-team-balance` requirements still describe the shipped behaviour.

## 執行紀錄

- `pnpm test`：237 tests passed（原 249，減去 `expected-margin.test.ts` 的 12 項）。
- `pnpm build`：`vue-tsc -b` 與 Vite production build 皆 exit 0。
- `git diff --check`：exit 0。
- `openspec validate remove-preview-balance-readout --strict --no-interactive`：valid。
- 刪除後 `src/` 內已無 `expected-margin`／`expectedMargin`／`describeBalance`／`balanceBand` 的殘留參照；
  `endpoint-distribution.ts` 的模組註解與 `matchmaking.ts` 依賴斷言一併更新。
- `calibrated-team-balance` 剩餘的 5 條 requirement 均對應 `src/lib/matchmaking.ts` 現行行為。

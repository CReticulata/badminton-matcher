## 1. RED UI Contract

- [x] 1.1 Update `src/session-fairness-display.test.ts` to require the live-match overlay to omit「賽後重置」and per-player reset buttons while `SessionView` still renders its secondary reset action; run the focused test and observe RED.
- [x] 1.2 Replace the live-overlay reset interaction test in `src/session-fairness-mounted.test.ts` with mounted absence and retained SessionView reset behavior coverage; run the focused test and observe RED.

## 2. Minimal GREEN Implementation

- [x] 2.1 Remove the live-overlay reset menu and component-only reset imports/computed/callbacks from `src/components/MatchDisplay.vue` without changing cancel or score-entry controls.
- [x] 2.2 Run the focused SSR and mounted suites GREEN and confirm the retained active-session reset path still emits the existing fairness events.

## 3. Verification

- [x] 3.1 Run the full Vitest suite and `pnpm build`; confirm no Rating, persistence, CSV, replay, or matchmaking code changed.
- [x] 3.2 Run strict OpenSpec validation, `git diff --check`, browser QA for the live overlay at mobile/landscape widths, and a fresh independent review resolving every P0–P3 finding.

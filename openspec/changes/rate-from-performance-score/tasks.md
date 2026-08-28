## 1. Shared endpoint distribution

- [x] 1.1 RED: add tests for `endpointStats(rallyRate, rules)` — normalisation to one, win probability monotone in the rally rate, symmetry about one half, exact values at zero and one, and agreement with the values recorded in `docs/research/score-aware-margin-calibration.md`.
- [x] 1.2 GREEN: add `src/lib/endpoint-distribution.ts` with the dynamic program and a memo keyed by rules and rate; no store, Vue, or DOM import.
- [x] 1.3 Refactor `src/lib/expected-margin.ts` to use it, leaving its public behaviour and tests unchanged.

## 2. Performance score

- [x] 2.1 RED: add tests for the observed score — close win above one half, dominant win near one, shutout exactly one, complements summing to one, and unknown formats returning the binary outcome.
- [x] 2.2 GREEN: implement the derivation in `src/lib/glicko2.ts` and use it in `applyMatch`; leave `updateRating` untouched.
- [x] 2.3 Confirm the published Glicko-2 worked-example tests still pass unmodified.

## 3. Propagate the format

- [x] 3.1 GREEN: thread the match's `scoringFormat` through `applyMatch`, `replayRatings`, `recalcAll`, `sessionRatingReport`, and the store's live update.
- [x] 3.2 RED: add a regression test that history containing only unknown-format matches replays to ratings identical to the previous implementation.
- [x] 3.3 RED: add a test that a mixed history rates each match by its own format.

## 4. Invariants

- [x] 4.1 RED: two matches identical except for margin produce different ratings under a known format, and the wider margin moves the winner further.
- [x] 4.2 RED: an excluded match still changes nothing, whatever its format.
- [x] 4.3 RED: editing a score still replays from the session opening snapshot and does not cross into the next session.
- [x] 4.4 RED: repeated replay of identical history is bit-identical.
- [x] 4.5 Confirm `src/lib/matchmaking.ts` imports neither the new module nor the scoring-format module.

## 5. Verify

- [x] 5.1 Run `pnpm test` and record the real file and test counts.
- [x] 5.2 Run `pnpm build` and confirm both steps exit zero.
- [x] 5.3 Run `git diff --check`.
- [x] 5.4 Run `openspec validate rate-from-performance-score --strict --no-interactive`.
- [x] 5.5 Replay the real exported CSV and confirm every rating is unchanged, since all existing matches are `legacy-missing`.
- [ ] 5.6 Browser walkthrough: record a match under a known format, confirm the rating delta differs between a narrow and a wide win with the same winner.

## 執行紀錄

- `pnpm test`：21 files / 247 tests passed。
- `pnpm build`：`vue-tsc -b` 與 Vite production build 皆 exit 0。
- `git diff --check`：exit 0。
- `openspec validate rate-from-performance-score --strict --no-interactive`：valid。
- **真實資料回歸（5.5）**：匯出的 29 場全為 `legacy-missing`，重播後每位球員的 rating 與
  CSV 現值最大誤差 `0.000e+0`。既有評分完全不受本變更影響。
- `src/lib/matchmaking.ts` 內無 `endpoint-distribution`、`expected-margin`、`scoring-format` 字串。

### 過程中發現的規格衝突

`scoring-format-snapshots` 有一條要求「相同參賽者與勝負、不同合法賽制產生完全相同的
rating」，並有測試鎖住。本變更刻意打破該不變式，因此提案原本寫的「Modified Capabilities:
None」是錯的。已補上 `## MODIFIED Requirements`，把該要求改寫為「Glicko-2 的算式、tau、
RD、volatility 與初始 rating 不變，但凍結的賽制快照可決定餵入的觀測得分」，並保留仍然
成立的較窄版本：兩場未知賽制、相同勝負者，不論分差結果相同。

### 尚未完成

- 5.6 需要真實瀏覽器操作，未執行。

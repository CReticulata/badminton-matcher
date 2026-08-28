## 1. Fairness partition, no behaviour change

- [x] 1.1 RED: add tests over `generateRound` pinning today's contract — voluntary rest excluded, strict fairness ordering by `playCount` then `consecutivePlayCount`, rest list contents, `null` when short-handed, and reproducibility under a seeded `Rng`.
- [x] 1.2 GREEN: partition eligible candidates by the fairness key in `src/lib/matchmaking.ts` and identify the boundary group; keep selection results identical.
- [x] 1.3 Run the focused matchmaking tests and confirm no existing assertion changed.

## 2. Joint selection within the boundary group

- [x] 2.1 RED: with every candidate tied, assert the chosen group and split reach the minimum team gap over all fairly equivalent options.
- [x] 2.2 RED: with a partial tie, assert every strictly fairer candidate plays and only the remaining places come from the boundary group.
- [x] 2.3 RED: assert a strictly fairer candidate is never benched to improve balance, and that voluntary rest still wins over any gap.
- [x] 2.4 GREEN: implement the joint search reusing `balanceTeams()` as the inner split search; leave `balanceTeams()` unmodified.

## 3. Variety within near-equal options

- [x] 3.1 RED: assert options within the tolerance of the best gap are all reachable across different random sources.
- [x] 3.2 RED: over repeated proposals with an unchanged roster, assert the rating extremes are not systematically benched and the mid-rated players are not always seated.
- [x] 3.3 RED: assert a seeded `Rng` reproduces an identical proposal.
- [x] 3.4 GREEN: implement the tolerance and the random tiebreak; state the tolerance and its rationale next to the constant.

## 4. Bound and fallback

- [x] 4.1 RED: assert a tie group beyond the bound still returns a proposal, using fairness order plus the split search.
- [x] 4.2 RED: assert the skipped-wide-search condition is observable rather than silent.
- [x] 4.3 GREEN: implement the bound and the fallback path.

## 5. Expected margin

- [x] 5.1 RED: add tests for `expectedMargin` — monotonic increase in the rating gap, exact values for the documented calibration table, rejection of unknown formats, and finite output across catalog and custom rules including `cap == target`.
- [x] 5.2 GREEN: implement `src/lib/expected-margin.ts` with the endpoint dynamic program and the calibrated coefficient; record value, CI, sample size, and source document beside the constant. No store, Vue, or DOM import.
- [x] 5.3 Assert the module is not imported by `src/lib/matchmaking.ts` — selection must not depend on the coefficient.

## 6. Preview readout

- [x] 6.1 GREEN: show an explicitly approximate lopsidedness indication in `src/components/PreviewView.vue` for structured formats, next to the existing manual-swap controls.
- [x] 6.2 GREEN: show nothing under an unknown format; no substituted default, no fabricated figure.
- [x] 6.3 Verify the indication updates after a manual swap and before the match starts, and that it presents no scoreline and no win probability.

## 7. Verify

- [x] 7.1 Run `pnpm test` and record the real file/test counts.
- [x] 7.2 Run `pnpm build` and confirm both steps exit zero.
- [x] 7.3 Run `git diff --check`.
- [x] 7.4 Run `openspec validate balance-teams-within-fairness-ties --strict --no-interactive`.
- [x] 7.5 Generate a session's worth of proposals from the real roster and inspect the distribution of who is seated, confirming the extremes are not benched systematically.
- [x] 7.6 Confirm the non-goals hold: `src/lib/glicko2.ts` unchanged, no stored shape change, fairness rules and their order unchanged, and no user-editable or auto-refitted coefficient.

## 執行紀錄

- `pnpm test`：19 files / 222 tests passed。
- `pnpm build`：`vue-tsc -b` 與 Vite production build 皆 exit 0。
- `git diff --check`：exit 0。
- `openspec validate balance-teams-within-fairness-ties --strict --no-interactive`：valid。
- `src/lib/matchmaking.ts` 內無 `expected-margin` 或 `scoring-format` 字串，選擇不依賴校準係數。

### 量測結果（實際名單 10 人、200 組種子）

| 情境 | 變更前 平均／p90 | 變更後 平均／p90 | 改善 |
|---|---:|---:|---:|
| 第 1 輪（全員並列） | 151 ／ 374 | 14 ／ 25 | 91% |
| 5 輪 | 155 ／ 374 | 85 ／ 334 | 45% |
| 20 輪 | 154 ／ 371 | 84 ／ 322 | 46% |

穩態改善低於第一輪，因為並列群隨上場次數分化而縮小，可選範圍變少。p90 幾乎不動：
那些回合是全場最強者（高出次高者 336 分）被公平規則強制排入時，任何組合都無法
平衡。這是名單結構造成的下限，不是演算法缺陷。

20 輪後每人恰好上場 8 次，最強者不例外。

### 過程中發現並修正的既有缺陷

終局分布動態規劃在 `target=11／winBy=2／cap=11` 下機率質量無法收斂到 1，因而發現
該類自訂賽制永遠打不完。修正於 `feat/scoring-format-snapshots`（PR #6）而非本分支，
以免有缺陷的驗證先進入 `main`。

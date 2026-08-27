## 1. Fairness partition, no behaviour change

- [ ] 1.1 RED: add tests over `generateRound` pinning today's contract — voluntary rest excluded, strict fairness ordering by `playCount` then `consecutivePlayCount`, rest list contents, `null` when short-handed, and reproducibility under a seeded `Rng`.
- [ ] 1.2 GREEN: partition eligible candidates by the fairness key in `src/lib/matchmaking.ts` and identify the boundary group; keep selection results identical.
- [ ] 1.3 Run the focused matchmaking tests and confirm no existing assertion changed.

## 2. Joint selection within the boundary group

- [ ] 2.1 RED: with every candidate tied, assert the chosen group and split reach the minimum team gap over all fairly equivalent options.
- [ ] 2.2 RED: with a partial tie, assert every strictly fairer candidate plays and only the remaining places come from the boundary group.
- [ ] 2.3 RED: assert a strictly fairer candidate is never benched to improve balance, and that voluntary rest still wins over any gap.
- [ ] 2.4 GREEN: implement the joint search reusing `balanceTeams()` as the inner split search; leave `balanceTeams()` unmodified.

## 3. Variety within near-equal options

- [ ] 3.1 RED: assert options within the tolerance of the best gap are all reachable across different random sources.
- [ ] 3.2 RED: over repeated proposals with an unchanged roster, assert the rating extremes are not systematically benched and the mid-rated players are not always seated.
- [ ] 3.3 RED: assert a seeded `Rng` reproduces an identical proposal.
- [ ] 3.4 GREEN: implement the tolerance and the random tiebreak; state the tolerance and its rationale next to the constant.

## 4. Bound and fallback

- [ ] 4.1 RED: assert a tie group beyond the bound still returns a proposal, using fairness order plus the split search.
- [ ] 4.2 RED: assert the skipped-wide-search condition is observable rather than silent.
- [ ] 4.3 GREEN: implement the bound and the fallback path.

## 5. Expected margin

- [ ] 5.1 RED: add tests for `expectedMargin` — monotonic increase in the rating gap, exact values for the documented calibration table, rejection of unknown formats, and finite output across catalog and custom rules including `cap == target`.
- [ ] 5.2 GREEN: implement `src/lib/expected-margin.ts` with the endpoint dynamic program and the calibrated coefficient; record value, CI, sample size, and source document beside the constant. No store, Vue, or DOM import.
- [ ] 5.3 Assert the module is not imported by `src/lib/matchmaking.ts` — selection must not depend on the coefficient.

## 6. Preview readout

- [ ] 6.1 GREEN: show an explicitly approximate lopsidedness indication in `src/components/PreviewView.vue` for structured formats, next to the existing manual-swap controls.
- [ ] 6.2 GREEN: show nothing under an unknown format; no substituted default, no fabricated figure.
- [ ] 6.3 Verify the indication updates after a manual swap and before the match starts, and that it presents no scoreline and no win probability.

## 7. Verify

- [ ] 7.1 Run `pnpm test` and record the real file/test counts.
- [ ] 7.2 Run `pnpm build` and confirm both steps exit zero.
- [ ] 7.3 Run `git diff --check`.
- [ ] 7.4 Run `openspec validate balance-teams-within-fairness-ties --strict --no-interactive`.
- [ ] 7.5 Generate a session's worth of proposals from the real roster and inspect the distribution of who is seated, confirming the extremes are not benched systematically.
- [ ] 7.6 Confirm the non-goals hold: `src/lib/glicko2.ts` unchanged, no stored shape change, fairness rules and their order unchanged, and no user-editable or auto-refitted coefficient.

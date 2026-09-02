## 1. Freeze the simulation contract

- [x] 1.1 Add a versioned immutable scenario/config schema under `docs/research/scripts/rotation-wildcard-simulation/` covering the exact bands, complete cell identities, participant counts, attendance families, duration/mode sequences, Rating profiles, one identical fixed set of at least 500 representative seeds per promotion cell, A/B/C/D method identities, nearest-rank quantile rule, equal-cell aggregation, metric definitions, and promotion gates from `design.md`; verify schema tests reject under-500, missing, duplicate, surplus, or non-counterpart identities.
- [x] 1.2 Add pinned development-only TypeScript runner support in `package.json`/lockfile without adding any runtime dependency or import from `src/`; add an import-graph assertion that no `src/**` module can import `docs/research/**`, and verify the Vite manifest/metafile contains no simulation source path or artifact hash after `npm exec --yes --package=pnpm@11.22.0 -- pnpm build`.
- [x] 1.3 RED: add fast tests proving named RNG streams are reproducible, attendance/duration manifests are method-independent, every required scenario cell exists, and keyed round/attempt draws do not shift later schedules when method branches consume different randomness.
- [x] 1.4 GREEN: implement only the manifest and named-stream generator needed to pass 1.3, then run the focused simulation test command recorded in the runner README.

## 2. Build the paired evaluator

- [x] 2.1 RED: add production matchmaking fixtures that expose the fixed fairness-band parameter without changing its default `0.5`, preserve minimum-anchored/non-transitive layering, and produce identical proposals with the same seeded RNG; also add fixed-playing-set split tests for `best + 25` eligibility, seeded variation, singles/doubles, and proof that splitting cannot change the supplied player set.
- [x] 2.2 GREEN: minimally parameterize the pure fairness-layer function in `src/lib/matchmaking.ts` while keeping production callers pinned to `0.5`, and extract `splitFixedPlayingSet(playing, mode, rng)` from the existing joint search so normal and future wildcard paths share exact balance-equivalent semantics; run focused matchmaking tests and `npm exec --yes --package=pnpm@11.22.0 -- pnpm build`.
- [x] 2.3 RED: add pure rotation-transform tracer tests needed by methods C/D, plus evaluator tests for actual-completed `t` versus actual-completed `t-2` set equality, separate normal-versus-actual trigger diagnostics, round-level replacement-capacity denominators, separately counted no-capacity controls, equal-cell effect aggregation, baseline-zero absolute handling, per-cell paired D−A maxima, no-interpolation nearest-rank p95, pooled/opportunity-weighted sensitivity non-authority, exact paired method keys, and under-500/duplicate/missing/surplus counterpart rejection.
- [x] 2.4 GREEN: implement the smallest production pure rotation-transform seam and the A/B/C/D evaluator by importing production pure matchmaking behavior, with fixed Rating covariates and identical manifests across methods; do not wire the transform into store/UI/release paths yet, and verify all tests from 2.3.
- [x] 2.5 Add a small labeled smoke command that writes protocol JSON, primary CSV, summary JSON, Markdown report, and SHA-256 receipt atomically under a smoke-only output path; rerun it twice and verify all non-runtime bytes and digests are identical.

## 3. Execute and audit simulation evidence

- [x] 3.1 Freeze the representative-run protocol before execution, including exact full seeds, source/dependency/runtime digests, row identities, artifact paths, and gate formulas; verify no smoke seed or output can be promoted as representative evidence.
- [x] 3.2 Run the representative paired simulation once without overlapping CPU-heavy evidence work; preserve bounded progress output and ordinary traceback diagnostics if it fails.
- [x] 3.3 Recompute every reported aggregate from the primary CSV, verify exact scenario/seed/method counts and pair keys, recompute all artifact SHA-256 values, and resolve any discrepancy in favor of primary rows before interpreting results.
- [x] 3.4 Publish `docs/research/rotation-wildcard-band-evaluation.md` with overall and per-count/attendance/mode/Rating slices, mean repeat reduction, p95 gates, p99/max disclosures, rejected candidates, and a clear statement of whether any candidate passed every gate.

## 4. Obtain the fairness-band authority gate

- [x] 4.1 Stop before changing the production `0.5` constant and present the verified report plus one recommendation to the user; do not infer approval from a passing metric.
- [ ] 4.2 **BLOCKED — representative study無候選通過全部門檻，本輪不得建立approval manifest。** If and only if the user explicitly approves one gate-passing candidate, create a version-controlled machine-readable approval manifest binding the exact report/summary SHA-256 digests, selected fixed value, disclosed regressions, human approver, and source/message identity; add tamper tests and a build/release guard that recomputes evidence digests, matches the production constant, and requires exactly `0.5` when no complete valid manifest exists; amend ADR 0003 with that value.
- [x] 4.3 If no candidate passes or no explicit approval is received, leave production at `0.5`, mark all later fairness-band production tasks blocked, and report that the simulation phase completed without production authorization.

## 5. Implement rotation-wildcard selection with TDD

- [x] 5.1 RED: add rotation-chronology tests for session-local positive unique completion sequences, persisted high-water allocation, equal timestamps, reload, CSV-row reorder, score edits, deletion gaps/no reuse, legacy `at + original row` migration, malformed present values blocking recovery, and proof that Glicko replay ordering is unchanged.
- [x] 5.2 GREEN: add `Match.completionSequence`, `Session.nextCompletionSequence`, one canonical rotation comparator, completion allocation, legacy migration/strict normalization, and use it for `consecutivePlayCounts` and future `t-2` lookup without changing Rating timeline code.
- [x] 5.3 RED: in focused `src/lib` tests, cover fewer than two completed matches, exact order-insensitive `t-2` equality by completion sequence, different-sized mixed modes, cooldown/degraded/no-outsider gates, doubles 25%, singles 12.5%, independent regeneration, exact one-seat uniform exchange, voluntary-rest exclusion, repeated prior exchange-out eligibility, and seeded reproducibility.
- [x] 5.4 GREEN: add the smallest pure rotation-wildcard transform and versioned lineage types in `src/lib/matchmaking.ts`/`src/types.ts`, preserving the normal proposal when any gate fails.
- [x] 5.5 RED: add wildcard integration tests proving the exchanged fixed playing set uses `splitFixedPlayingSet`, retains `+25` Rating-gap seeded variation, never admits an out-of-tolerance split, and can never be reselected into a different playing set.
- [x] 5.6 GREEN: route the exchanged playing set through the already-tested fixed-set split seam without reading or writing Rating state; rerun all focused matchmaking and Glicko non-interference tests.
- [x] 5.7 After task 4.2 only, replace the production fairness-band constant with the exact approved value and add tests pinning that value for singles, doubles, all participant counts, minimum-anchored layer behavior, valid-manifest success, absent-manifest `0.5`, and constant/candidate/report/summary/approver/source tampering failures; otherwise leave `0.5` unchanged.

## 6. Implement lineage and forward-only cooldown with TDD

- [x] 6.1 RED: add store tests covering proposal lineage, exact set equality `final = normal - exchangedOut + exchangedIn`, team-only swaps preserving lineage, exchange-in removal, exchange-out restoration, and any third-seat change clearing lineage, unrestricted non-wildcard manual lineups, reload/live revalidation, match-start freeze, valid completion, cancellation, and incomplete matches.
- [x] 6.2 GREEN: carry optional versioned lineage through `RoundProposal` and persisted `MatchContext`, validate canonical one-seat set equality after each manual exchange, after reload, and before completion, and copy only surviving lineage to `Match`.
- [x] 6.3 RED: add store tests for valid wildcard completion setting cooldown `2`, singles/doubles sharing it, normal and forced-unrated completion decrementing it, proposals/cancellations not decrementing, score edits/deletions not rewinding, new-session reset, reload persistence, and end-session isolation.
- [x] 6.4 GREEN: add `rotationWildcardCooldownRemaining` to active-session transitions as independent forward-only state; do not derive it from mutable match history.
- [x] 6.5 RED: add fairness-degradation tests proving draws are disabled, countdown is frozen, total-count fallback still proposes normally, repair resumes the exact prior count, and no reliable wildcard lineage is fabricated during degradation; include a valid wildcard live match that enters degradation before completion, sets cooldown `2` on completion, remains paused, then decrements only after repair.
- [x] 6.6 GREEN: gate wildcard and cooldown transitions on the existing reliable-fairness state and expose a typed paused reason for UI.

## 7. Implement persistence, migration, and CSV fail-closed behavior

- [x] 7.1 RED: extend normalization/recovery tests for missing legacy fields, active legacy cooldown `0`, valid version-1 lineage, unknown lineage version, malformed or duplicate IDs, wrong normal-set size for mode, exchange-in/out membership errors, impossible final one-seat equality, non-integer/out-of-range cooldown, non-positive/non-integer/duplicate completion sequences, invalid high-water marks, and no inference from unusual legacy lineups.
- [x] 7.2 GREEN: implement strict optional-field normalization in `src/lib/app-data-normalization.ts`; missing means legacy default, while present malformed data enters the existing blocked recovery path.
- [x] 7.3 RED: add CSV tests for session cooldown/high-water mark, match completion sequence, JSON live lineage, completed-match lineage, old headers without new columns, equal-timestamp legacy row-order migration, post-migration row reorder stability, exact round-trip, older-checkpoint restore replacing newer cooldown/sequence state, malformed present fields causing zero partial replacement, and unchanged import size/record/field limits.
- [x] 7.4 GREEN: add `rotationWildcardCooldownRemaining` and `nextCompletionSequence` to `[sessions]`, and `completionSequence` plus `rotationWildcard` to `[matches]` in `src/lib/csv.ts`, preserving strict row-width and field validation.
- [x] 7.5 Run focused persistence/recovery/CSV tests and prove an equivalent wildcard-origin and manual-origin match produce identical appearance lineage, Glicko update, scoring-format behavior, and bounded replay output.

## 8. Implement visible audit UI with component TDD

- [x] 8.1 RED: add preview component tests for the `外卡` badge, `換入／換出` names, immediate removal after exchange-in removal, exchange-out restoration, or any third-seat change, and retention after team-only swaps.
- [x] 8.2 GREEN: render compact preview evidence from current proposal lineage without predicting future draws or outcomes.
- [x] 8.3 RED: add active/live component tests for compact live `外卡`, `外卡冷卻：剩 2 場／1 場`, hidden zero state, and degraded-mode pause wording.
- [x] 8.4 GREEN: render live and active-session state from persisted lineage/cooldown and the existing degradation result.
- [x] 8.5 RED: add history component tests for completed `輪替外卡` marker and exchange pair, no marker on legacy/manual records, and no new ended-session play-rate summary.
- [x] 8.6 GREEN: render completed wildcard evidence without changing history edit/delete authority or Rating summaries.
- [x] 8.7 RED: add CSV import-confirmation tests that show complete checkpoint overwrite semantics, the backup active-session cooldown when present, completion-order/current-state replacement warning, and a current-data export action before confirmation.
- [x] 8.8 GREEN: extend the existing import modal with the tested warning and backup-state summary; keep validation-before-replacement and do not merge newer local cooldown into the backup.

## 9. Integrate and verify

- [x] 9.1 Update `CONTEXT.md`, root `design.md`, feature acceptance docs, and ADR 0003 to match the approved implementation and exact fairness-band authority; remove any stale `0.5` prose only after task 4.2.
- [x] 9.2 Run focused RED/GREEN suites after each bounded surface, then run `npm exec --yes --package=pnpm@11.22.0 -- pnpm test` and record exact file/test counts. Final: 37 files / 403 tests passed.
- [x] 9.3 Run the approval-manifest release guard and `npm exec --yes --package=pnpm@11.22.0 -- pnpm build`; verify the production dependency graph and output manifest contain no simulation modules/artifacts, and verify wildcard generation cannot ship independently before the approved-band gate passes.
- [x] 9.4 Run `openspec validate reduce-repeating-lineups --strict` and resolve every error without weakening requirements or dropping failed scenarios.
- [x] 9.5 Perform headed browser acceptance for doubles and singles repeat/non-repeat draws, regeneration, manual invalidation, two-match shared cooldown, mode switching, degradation/repair, reload, CSV round-trip, history evidence, legacy import, and Rating non-interference; retain an evidence note and remove temporary screenshots.
- [x] 9.6 Obtain independent code/spec review focused on stochastic boundaries, cumulative fairness tails, migration, history-delete non-retroactivity, UI truthfulness, and Glicko/replay isolation; resolve findings and rerun affected gates. Final exact-tree review: zero P0–P3 findings; 37 files / 403 tests, build/isolation/release-authority/strict-OpenSpec/diff gates passed.

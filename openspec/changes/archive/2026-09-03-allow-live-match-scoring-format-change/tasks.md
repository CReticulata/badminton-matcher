## 1. U1 — Identity-bound live-format command

- [x] 1.1 RED: add the first store test for a matching expected live-match identity replacing 21 points with 15 while preserving every non-format field, `startedAt: 0`, `fairnessPeriodIds`, wildcard lineage, lineup, resters, mode, live-match ID, session attendance/chronology/cooldown fields, session default, and caller-input no-alias behavior; run it and record the expected missing-command failure.
- [x] 1.2 GREEN: add the minimal discriminated-result command in `src/store.ts` that validates and clones the snapshot, persists a complete candidate application-data value, commits independent reactive and recoverable live contexts only after that write succeeds, and passes the focused test.
- [x] 1.3 RED→GREEN, one case at a time: prove blocked recovery, missing live authority, stale expected identity, and mutually inconsistent live identities each return a distinguishable refusal with no mutation and no persistence write.
- [x] 1.4 REFACTOR only while green: remove duplication in live-context cloning/result construction without changing persisted shapes or unrelated store commands.

## 2. U2 — Durable persistence and rollback

- [x] 2.1 RED→GREEN: prove a successful replacement survives module reload as the same live match with only the replacement snapshot and no reconstructed prior format.
- [x] 2.2 RED: inject a first-write-only localStorage failure and prove the command must refuse while both live authorities, prior persisted bytes, complete score-flow state, and visible persistence warning remain unchanged through Vue's queued watcher flush; prove no automatic second write occurs.
- [x] 2.3 GREEN: persist a complete candidate application-data value through the existing backup and warning boundary before mutating reactive state; return `persistence-failed` without mutation on failure, and commit independent live clones only after persistence succeeds.
- [x] 2.4 RED→GREEN: prove success creates no aliases, a failed candidate reloads the prior format, and a later explicit retry can succeed after storage recovers.

## 3. U3 — Shared transient score-flow state

- [x] 3.1 RED: mount score entry, enter one or both raw scores, return to the live display, and prove the draft remains available only while the active live-match identity is unchanged.
- [x] 3.2 GREEN: move the owning live-match ID, raw scores, and validation error into the existing non-persisted `ui` state, reconcile ownership before access, keep force-unrated eligibility derived, and preserve current score-entry behavior.
- [x] 3.3 RED→GREEN, one boundary at a time: prove failed submission retains the same-identity draft; successful submission, live cancellation, session ending, session replacement, and any transition to a different or absent live identity clear it; reload never restores it.
- [x] 3.4 RED→GREEN: prove successful CSV/checkpoint import or recovery that installs a different live match clears the prior raw scores, validation error, and force-unrated feedback before the imported/recovered match can use either format entry.
- [x] 3.5 Run existing unrated, scoring-format, recovery, import, and fairness mounted tests before adding replacement UI.

## 4. U4 — Score-entry replacement path

- [x] 4.1 RED: add a mounted blank-score test showing score entry can open the existing format choices and durably replace the expected live match without confirmation.
- [x] 4.2 GREEN: add one reusable `LiveScoringFormatEditor` coordinator around `ScoringFormatPicker` and mount it in score entry; keep picker snapshot creation and validation unchanged.
- [x] 4.3 RED→GREEN, one case at a time: non-empty confirmation accept, decline, picker cancel, same-format save, stale identity, blocked/missing/inconsistent authority, and persistence failure. Clear shared scores, validation error, and force-unrated feedback only after a matching durable-success result.
- [x] 4.4 RED→GREEN: prove repeated replacement uses the latest snapshot, completion stores only it, endpoint validation and Rating consume it, and a later proposal still inherits the unchanged session default.

## 5. U5 — Live-display parity

- [x] 5.1 RED: enter a score draft, return to the live display, initiate replacement there, and prove the same confirmation and success-only clearing protocol is required.
- [x] 5.2 GREEN: mount the shared editor behind a secondary live-display action without duplicating command, confirmation, or draft-clearing logic.
- [x] 5.3 RED→GREEN, one case at a time: blank switch, retained-draft accept and decline, picker cancel, command refusal, repeated replacement, and immediate same-format rendering on both surfaces.
- [x] 5.4 Prove cancel and score-entry controls remain available, and that no removed reset control or unreleased wildcard control reappears.

## 6. U6 — Closure and acceptance

- [x] 6.1 Run the focused store, persistence, mounted UI, scoring-format, unrated, Rating, recovery, `rotation-fairness`, `rotation-chronology`, `rotation-wildcard-release`, and wildcard non-interference suites named in the implementation plan. Confirm bounded before/after assertions preserve fairness lineage, attendance, completion sequence, cooldown, and wildcard metadata; resolve every failure through a new RED→GREEN cycle.
- [x] 6.2 Run the complete suite with `npm exec --yes --package=pnpm@11.22.0 -- pnpm test`.
- [x] 6.3 Run the production build and release guards with `npm exec --yes --package=pnpm@11.22.0 -- pnpm build`; verify `ROTATION_WILDCARD_GENERATION_RELEASED` remains false.
- [x] 6.4 Run headed mobile acceptance at 390×844 and 844×390: both entry points, blank switch, retained-draft decline and accept, durable failure preservation, repeated switch, final completion, next-match default, unobscured controls, and page/console error inspection.
- [x] 6.5 Run `openspec validate allow-live-match-scoring-format-change --strict --no-interactive` and `git diff --check`. Verify the archive scenario map explicitly: old override/default scenarios map to their renamed pre-start/session-default equivalents; the former post-outcome prohibition is intentionally replaced by live-replacement and deliberate-draft scenarios; every unrelated base scenario remains exact.
- [x] 6.6 Obtain a fresh independent exact-tree review for requirement closure, Rating/fairness non-interference, persistence rollback/recovery, mobile UI regressions, and test fidelity. Resolve every P0–P3 production finding, rerun affected gates, and require a fresh review after any production change.

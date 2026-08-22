## 1. Establish prerequisite and shared-worktree boundaries

- [ ] 1.1 Before editing research/tooling files, save complete `git status --porcelain=v1 -uall` outside the repository and record pre-edit existence/SHA-256 for every planned target plus protected production `src/`, package/lock, archived protocol/evidence, and stable OpenSpec specs.
- [ ] 1.2 Verify `define-scoring-format-snapshot-semantics` is complete, synced, archived, and strict-valid; record the archived change and stable `scoring-format-snapshots` spec digests. Stop if this prerequisite is not met.
- [ ] 1.3 Record the authorized implementation boundary: protocol, validators, deterministic fixtures, development-only candidate/reference code, runner construction, and tests only. No development, smoke, confirmation, reserved-seed, product-history, formal, or production run is authorized.
- [ ] 1.4 Inventory reusable artifact-integrity, deterministic-runner, Glicko comparator, matchmaking fairness, and frozen research surfaces. Classify each as reusable code, bounded reference, historical evidence only, or protected non-target; do not mutate frozen protocols, validators, amendments, receipts, or published artifacts.

## 2. Freeze the protocol schema before candidate outcomes

- [ ] 2.1 Add RED contract tests under a new bounded `analysis/score_aware_candidate_study/` test surface for exact protocol fields, schema/version, canonical serialization, SHA-256 identity, candidate/comparator identity, cohort/data identity, world and seed partitions, metrics/thresholds, tuning boundary, stopping rules, authority fields, and amendment lineage.
- [ ] 2.2 Run the focused protocol-contract test command and preserve genuine RED output before adding the schema/canonicalizer/validator implementation.
- [ ] 2.3 Implement the minimal protocol schema, canonicalizer, digest builder, and fail-closed validator in offline research tooling. Reject missing/extra fields, unsupported versions, nonfinite thresholds, overlapping execution classes, unfrozen candidate selection, and any production/shadow/promotion authority.
- [ ] 2.4 Write the prospective protocol document and canonical machine-readable protocol with an exact simple game-level candidate, current winner-only Glicko comparator, supported snapshot/catalog versions, event/roster/cold-start rules, chronological partitions, synthetic world families, metrics, numeric gates or deterministic rules, stop matrix, and evidence labels.
- [ ] 2.5 Add a documentation/semantic validator proving every normative protocol field agrees across human-readable and machine-readable forms; run focused tests to GREEN and record the protocol digest without executing any study outcome.
- [ ] 2.6 Stop for owner approval of the exact human/machine protocol digest, including candidate equation/constants or complete development grid, selection objective/multiplicity/tie rules, pre-match information sets, fallback event policy, fairness-shell mapping, world/keyed-randomness contract, metrics, thresholds, locked-input commitments, and decision matrix. Do not begin group 3 without this approval.

## 3. Build the simple candidate and comparator reference boundary with TDD

- [ ] 3.1 Add RED unit/property tests for the frozen candidate observation equation, state initialization, update order, supported-format handling, team/player exchange symmetry, deterministic replay, cold-start, roster churn, unsupported mode, and unknown/custom/legacy exclusion.
- [ ] 3.2 Add RED comparator tests that bind the current winner-only Glicko projection and prove the research adapter consumes only the same chronological winner/loser events without changing production `src/lib/glicko2.ts`.
- [ ] 3.3 Run focused candidate/comparator tests and preserve assertion-level RED evidence before implementation.
- [ ] 3.4 Implement the minimal offline candidate and read-only Glicko comparator adapter under `analysis/score_aware_candidate_study/`; do not import the candidate into production `src/`, browser store, UI, CSV, Worker, or matchmaking authority paths.
- [ ] 3.5 Re-run focused tests to GREEN, including deterministic golden fixtures, malformed snapshot rejection, no score inference, same-event winner-only fallback for custom/unknown/legacy/unsupported matches, and byte-identical state/output replay.

## 4. Implement the chronological product-history evaluation contract

- [ ] 4.1 Add RED tests for content-addressed input snapshots, exact event ordering, common model event exposure, observed-schedule replay with no fairness-shell call or generated proposal, supported catalog evidence, same-event winner-only fallback for custom/unknown/legacy/unsupported matches, malformed-snapshot rejection, roster/cold-start semantics, chronological train/tune/test boundaries, locked-test access denial, coverage floors, and required strata.
- [ ] 4.2 Add RED metric tests proving forecasts are emitted before winner/terminal-score reveal and binding the exact target, pre-match information set, probability transform, endpoint and winner Brier/log loss, calibration, aggregation, tie/invalid handling, coverage, and prespecified roster/history strata with explicit finite/missing/unevaluable behavior.
- [ ] 4.3 Run the focused history-evaluation tests and preserve RED evidence before implementation.
- [ ] 4.4 Implement the offline reader/evaluator and development-only fixture path. It may use synthetic hand-authored fixtures for tests but MUST NOT open or evaluate an owner data export or locked product snapshot.
- [ ] 4.5 Re-run focused tests to GREEN and prove random game splitting, inferred formats, duplicate events, stale/wrong data digests, early locked access, and undersized cohorts fail closed.

## 5. Implement the paired synthetic closed-loop direct-value contract

- [ ] 5.1 Add RED tests for world schema, known latent truth, ordinary/sparse/roster-churn/misspecified/stress strata, development versus locked confirmation identities, path-independent keyed/counter-based potential-outcome draws and ledger, policy-order/irrelevant-branch invariance, and separate policy trajectories after matchup divergence.
- [ ] 5.2 Add RED fairness-shell tests binding one versioned interface/state schema and production-rule mapping, proving comparator and candidate share exact eligibility, play-count priority, consecutive-play, volunteer-rest, rotation, and deterministic tie-breaking; any mismatch invalidates the complete replication.
- [ ] 5.3 Add RED direct-metric tests for absolute latent team-strength gap, median/tail/severe-imbalance summaries, paired world-level aggregation, oracle sanity, random-floor sanity, and non-compensation of fairness failures.
- [ ] 5.4 Run the focused closed-loop tests and preserve genuine RED evidence before implementation.
- [ ] 5.5 Implement the bounded synthetic world generator, shared fairness-first policy shell, comparator/candidate closed-loop runner, truth-based metrics, and sanity controls using development identities only.
- [ ] 5.6 Re-run focused tests to GREEN, including policy divergence, paired identity, fairness exactness, world-level—not pooled-game—analysis, and deterministic byte-identical non-runtime outputs.

## 6. Build fail-closed execution and publication infrastructure

- [ ] 6.1 Add RED tests for exact run manifests, protocol/code/data/world and candidate-selection-receipt digests, owner-issued capability scope, execution-class allowlists, sealed-input release, unit identities, duplicate/missing paired counterparts, nonfinite values, manifest-bound resumable private workspaces, existing/symlinked/foreign destinations, exclusive publication admission, staged no-replace publication, and immutable published outputs.
- [ ] 6.2 Add RED decision-matrix tests for `PASS`/`FAIL`/`UNEVALUABLE`, non-compensatory predictive/direct/fairness/determinism gates, stop/narrow/reformulate/bounded-go outcomes, and separate research/engineering/formal/safety/protocol/production fields.
- [ ] 6.3 Run focused artifact/publication tests and preserve RED evidence before implementation.
- [ ] 6.4 Implement manifest validation, separately issued owner-capability verification, post-selection sealed-input release, selection-receipt binding, bounded unit dispatch contracts, resumable state, aggregate validation, staged no-replace atomic publisher, and mechanically derived decision receipt. Default every run command to deny execution; a self-authored manifest can never grant authority.
- [ ] 6.5 Re-run focused tests to GREEN; prove interruption, partial completion, wrong digests/selection receipt, forged or mismatched capability, unauthorized seeds/data, early locked access, malformed rows, missing counterparts, existing/symlinked/foreign destinations, lock/write/audit failure, and publisher failure never start unauthorized work or produce a final receipt.

## 7. Protect authority and historical provenance

- [ ] 7.1 Add repository tests asserting production `src/`, localStorage, CSV, score submission, UI, Glicko, matchmaking, and J1 shadow request/output contracts contain no candidate-study imports, state, writes, predictions, or branches.
- [ ] 7.2 Add documentation checks preserving the Phase 2A failure, blocked Phase 2B status, J1 engineering-only scope, 93-world post-hoc exploratory nonformal label, `formal_inference=false`, `safety=NOT_EVALUATED`, `protocol_advancement=false`, and Glicko sole-authority statement.
- [ ] 7.3 Verify no existing frozen protocol, validator, amendment, receipt, archived artifact, or result changed byte-for-byte.

## 8. Verification and owner execution gate

- [ ] 8.1 Run all focused protocol, candidate/comparator, product-history, synthetic closed-loop, fairness, artifact, publisher, authority, and documentation tests; report exact pass/fail/skip counts.
- [ ] 8.2 Run the repository's safe full Python/TypeScript test, typecheck, build, OpenSpec strict validation, and whitespace/integrity gates that do not execute study worlds or product data.
- [ ] 8.3 Run deterministic fixture replays twice and prove canonical non-runtime outputs are byte-identical; fixtures must be hand-authored/development-only and not count as study evidence.
- [ ] 8.4 Compare post-edit status and protected hashes with task 1.1; report only owned files and any concurrent unrelated changes.
- [ ] 8.5 Publish an implementation receipt listing protocol digest, code/validator digests, tests, protected boundaries, limitations, and explicit statuses. State that zero study runs, zero locked seeds, and zero product-history evaluations were executed.
- [ ] 8.6 Stop for owner review. Do not authorize or execute development, smoke, confirmation, reserved-seed, product-history, formal, or production runs; do not archive this study change, start a browser shadow, add model complexity, or alter Glicko authority without separate explicit approval.

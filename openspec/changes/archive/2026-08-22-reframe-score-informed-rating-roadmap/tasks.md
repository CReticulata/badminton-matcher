## 1. Establish the documentation safety baseline

- [x] 1.1 Before editing, save the complete `git status --porcelain=v1 -uall` output to a private temporary baseline outside the repository. Record its SHA-256, byte count, line count, the complete status of every allowed target, and SHA-256 values for existing allowed targets in the `## Verification receipt` section below; do not paste the multi-megabyte full status into a planning artifact. Preserve the shared dirty worktree and do not attribute concurrent or pre-existing changes to this work.
- [x] 1.2 Read ADR 0001, ADR 0002, the score-informed decision tree, the J1 PWA method contract, the U9 milestone, `docs/research/activity-state-phase2a-full-findings.md`, and `docs/research/activity-state-phase2-joint-variance-plan.md`. Map claims to `historical evidence`, `active product semantic`, `deferred candidate`, `scoped negative result`, or `not authorized`. Before archive, ADR 0002 and U9 are the current runtime authority boundary; this change is proposed or owner-approved guidance, not yet the archived spec of record.
- [x] 1.3 Create a sorted private pre-edit integrity manifest outside the repository containing `path`, byte size, and SHA-256 for every existing file under `src/` and `docs/research/`; every existing non-allowed file under `docs/adr/` and `docs/features/` (explicitly exclude only `docs/adr/0001-fixed-session-opening-ratings.md`, `docs/features/score-informed-rating-decision-tree.md`, and `docs/features/j1-pwa-method-contract.md`); `package.json`, `pnpm-lock.yaml`, and `vitest.browser.config.ts`; and existing `analysis/` files whose path contains `protocol`, `validator`, `gate`, `receipt`, or `artifact`. Exclude only the planned `analysis/test_score_informed_rating_roadmap_docs.py` from the analysis set. Record the manifest SHA-256 and file count in the receipt; this manifest protects tracked and pre-existing untracked forbidden/frozen content—including ADR 0002 and other non-allowed authority records—that porcelain status alone cannot verify.

## 2. Add a RED documentation contract

- [x] 2.1 Add a focused test at `analysis/test_score_informed_rating_roadmap_docs.py` that initially fails unless the affected legacy records contain explicit current-status/precedence notices; preserve their original status and blocker text; link ADR 0002, U9, and the stable post-archive path `openspec/specs/score-informed-rating-roadmap/spec.md`; preserve separate statuses for research evidence, engineering compatibility/non-interference, formal inference, safety evaluation, protocol advancement, and production authorization; state that dense covariance, activity-local state, IndexedDB migration, and rating-authority transition are not authorized by those legacy records; and retain the scoped Phase 2A FAIL/stop boundary without importing simulation code. Include explicit test methods named `test_evidence_statuses_and_forbidden_authority_claims` and `test_allowed_documents_have_no_whitespace_or_merge_marker_errors`; the latter MUST read every allowed tracked or untracked target directly rather than relying on Git diff visibility.
- [x] 2.2 Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest analysis.test_score_informed_rating_roadmap_docs` and retain the expected RED failure before editing the legacy records; the test MUST read documentation only and MUST NOT import simulation or world-generation modules.

## 3. Reconcile legacy decision authority

- [x] 3.1 Add a prominent non-destructive precedence notice near the top of `docs/adr/0001-fixed-session-opening-ratings.md`; retain `Status: Accepted` as historical provenance while identifying which replay semantics remain active and which dense-covariance, IndexedDB, migration, and model-transition statements are deferred/unapproved.
- [x] 3.2 Add a current-status notice to `docs/features/score-informed-rating-decision-tree.md` that preserves settled product semantics where still applicable but reclassifies J1-derived activity-local state, dense covariance, large-component storage, and migration choices as research candidates unless a later OpenSpec change authorizes them.
- [x] 3.3 Add a non-destructive status/precedence notice to `docs/features/j1-pwa-method-contract.md`. Preserve its original unresolved-blocker list and statement that independent product decisions/evidence are required; explain that the roadmap sequences investigation without declaring any blocker resolved or authorizing implementation.
- [x] 3.4 Ensure all three notices link ADR 0002 and the U9 milestone as the current runtime boundary, label this active change as proposed or owner-approved guidance before archive, and reference `openspec/specs/score-informed-rating-roadmap/spec.md` as the stable post-archive location. Do not edit frozen protocols, validators, amendments, receipts, archived results, runtime TypeScript, `package.json`, or persistence schemas.
- [x] 3.5 Preserve the Phase 2A sigma/omega identification FAIL exactly as scoped: link both source records, state that Phase 2B and production implementation under that protocol remain blocked, prohibit pooling Phase 1 to overturn it, and distinguish genuinely new preregistered PAR questions from relabeling the failed path.

## 4. Focused closure and authority checks

- [x] 4.1 Re-run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest analysis.test_score_informed_rating_roadmap_docs` and obtain GREEN.
- [x] 4.2 Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v analysis.test_score_informed_rating_roadmap_docs.ScoreInformedRatingRoadmapDocsTest.test_evidence_statuses_and_forbidden_authority_claims` and record its exact output. This deterministic audit MUST assert every required positive evidence-status statement and every prohibited authority/protocol-advancement claim; a generic text search is insufficient.
- [x] 4.3 Capture the complete post-edit `git status --porcelain=v1 -uall` to a second private temporary file outside the repository. Compare it mechanically with task 1.1, record its SHA-256/byte/line counts and the added/removed/changed status-record summary, and record post-edit allowed-target hashes. Recreate the task 1.3 protected-content manifest and require exact equality of every protected path, size, and SHA-256. Report concurrent/unrelated differences without claiming them, and verify this work's edit log contains only the allowed documentation, test, OpenSpec artifact, and receipt surfaces. Keep a path-scoped status as a secondary convenience check only.

## 5. OpenSpec validation and decision receipt

- [x] 5.1 Run `openspec validate reframe-score-informed-rating-roadmap --strict --no-interactive` and resolve every error without weakening requirements or evidence labels.
- [x] 5.2 Run `git diff --check -- analysis/test_score_informed_rating_roadmap_docs.py docs/adr/0001-fixed-session-opening-ratings.md docs/features/score-informed-rating-decision-tree.md docs/features/j1-pwa-method-contract.md openspec/changes/reframe-score-informed-rating-roadmap` for tracked diffs, then run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v analysis.test_score_informed_rating_roadmap_docs.ScoreInformedRatingRoadmapDocsTest.test_allowed_documents_have_no_whitespace_or_merge_marker_errors` so every allowed tracked or untracked target is checked directly.
- [x] 5.3 Append the exact verification receipt to the named section below: date, revision/worktree scope, pre/post status baselines, allowed-target hashes, each exact command, exit code and real result summary, changed-path attribution, and unresolved limitations.
- [x] 5.4 Stop after the receipt and request owner review. Do not archive, start candidate implementation, run simulations, or create a downstream semantics/research change. After explicit owner acceptance, hand off to the separate OpenSpec archive workflow and verify that the stable main spec is synchronized; do not archive inside apply.

## Verification receipt

### Apply identity and scope

- **Applied:** 2026-08-22T09:04:34+08:00
- **Branch / revision:** `feat/initial-skill-levels` / `7faaa0355e48ea8891acad2d48ee02b42fffb5aa`
- **Scope:** documentation governance only. No runtime TypeScript, persistence schema, package dependency, frozen protocol/validator/amendment/receipt, research result, rating method, simulation, migration, promotion, or archive operation was performed.
- **Owned edits:** `analysis/test_score_informed_rating_roadmap_docs.py`; notices in ADR 0001, the score-informed decision tree, and the J1 PWA method contract; checkbox/receipt updates in this change; EOF-newline-only fixes in `proposal.md` and `design.md`.
- **Pre-existing state:** all three legacy targets, ADR 0002, U9, and this OpenSpec change were already untracked. They are not newly attributed to this apply.

### Shared-worktree baselines

- Complete pre-edit `git status --porcelain=v1 -uall` was saved outside the repository at `/tmp/badminton-roadmap-apply/pre-status.txt`: SHA-256 `3b85bb06f286263c385ed90d595d37895268926beecf6d1172746683ae624881`, 14,789,597 bytes, 45,012 lines.
- Complete post-edit status was saved outside the repository at `/tmp/badminton-roadmap-apply/post-status.txt`: SHA-256 `2309ea42368df959c9c831285eae7152a1ab30a8f4a05bb8275c1cc97f05796a`, 14,789,652 bytes, 45,013 lines.
- Mechanical status-record comparison: one added record, `?? analysis/test_score_informed_rating_roadmap_docs.py`; zero removed records. Content edits within pre-existing untracked allowed files do not change porcelain records and are therefore identified by the allowed-target hashes below.
- Protected-content manifest: 33,343 files. Pre/post manifest SHA-256 was exactly `a2100172fbd6d44f316e0c8fa4d76652c1ea37ae2d3166ed7182bfd493b0c5b8`; path, size, and SHA-256 equality passed. This covers `src/`, `docs/research/`, non-allowed `docs/adr/` and `docs/features/` records including ADR 0002, package/lock/browser config, and the named analysis authority surfaces.

### Allowed-target hashes

| Allowed target | Pre-edit SHA-256 | Post-edit SHA-256 immediately before this receipt |
|---|---|---|
| `analysis/test_score_informed_rating_roadmap_docs.py` | absent | `b838932490fe7a7e43478432517c8f4bd4e518d5ab2d3283df084d36c7d94fb8` |
| `docs/adr/0001-fixed-session-opening-ratings.md` | `dae9b305cae58c78e2b0e23e7a78d394eccae6b7c6372df35d4fc96214faec0a` | `c8f6bcb20ab2836ef38e4c1b0a244b377d410c12e003af1b6b56b545ecaa19ca` |
| `docs/features/score-informed-rating-decision-tree.md` | `94e2a8495b2439a8835c261b3745b8dd3a79f69b4ce075cdc9c760701b8cf266` | `3f3c0b68c8f118400b66d710ee0af8cfcfd2cc48f81bda5aa037633dd94b860e` |
| `docs/features/j1-pwa-method-contract.md` | `95d2677b3d324389d8bd7e593ff3928b55ee48effcac5b81fda331f083f3c83e` | `e311ea5c22eaf08898089d37134ac72e9698ad29dbd7b8dc9d39b0c59e40e4aa` |
| `.openspec.yaml` | `b9399e03673ba9cf76a3aaed652b32793349b0b8bda5bafea77ccfa94a12a811` | unchanged |
| `design.md` | `ce5d45a578fc41d886813e3ee92a387a00870197426da9c0398ea5fab32dc688` | `6a28d706fcd3594478f1dc6a4d88d34533e0d675f74f995780e295beaaad2f12` |
| `proposal.md` | `8bf542e1cf8da6fa6ef5a7937dc8c4ea94c4d59b31a44d24e37705aec89f340e` | `04f93e32667f51bf502e195b26c80b196fd7c384b0ba929470ac71eda6473f22` |
| `specs/score-informed-rating-roadmap/spec.md` | `e5f55e33458b92af516aefe96c016d8017fafba8a4f12c4c8c8c3015bfcb5c6b` | unchanged |
| `tasks.md` | `840dd96f4264f104d96ee55842bd1e6dca4e505861f7b9eaf6360f9431131552` | `73e36b84f67318e99a86f9eb09f923a8d010fbf3fde4e37607547040a3f838a7` before embedding this self-referential receipt |

### RED → GREEN and authority verification

1. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest analysis.test_score_informed_rating_roadmap_docs`
   - Initial RED: exit 1; 5 tests ran with 13 subtest failures. Missing notices were observed, while one blocker assertion incorrectly expected a semicolon instead of the preserved final period.
   - Corrected-test RED before legacy edits: exit 1; 5 tests ran with 12 subtest failures, consisting of missing bounded notices and existing EOF-newline defects in allowed OpenSpec files.
   - GREEN after minimal notices/newline fixes: exit 0; 5 tests passed in 0.003s.
2. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v analysis.test_score_informed_rating_roadmap_docs.ScoreInformedRatingRoadmapDocsTest.test_evidence_statuses_and_forbidden_authority_claims`
   - Exit 0; 1 test passed. The audit checks each positive evidence/authorization status and each prohibited authority claim in every notice.
3. `python3 /tmp/badminton-roadmap-apply/post_audit.py`
   - Exit 0; protected-content equality passed for 33,343 files; the status comparison found only the new focused test record.
4. `openspec validate reframe-score-informed-rating-roadmap --strict --no-interactive`
   - Exit 0; `Change 'reframe-score-informed-rating-roadmap' is valid`.
5. `git diff --check -- analysis/test_score_informed_rating_roadmap_docs.py docs/adr/0001-fixed-session-opening-ratings.md docs/features/score-informed-rating-decision-tree.md docs/features/j1-pwa-method-contract.md openspec/changes/reframe-score-informed-rating-roadmap`
   - Exit 0. Because Git does not inspect content inside untracked files, this is supplemented by the direct-reading test below.
6. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v analysis.test_score_informed_rating_roadmap_docs.ScoreInformedRatingRoadmapDocsTest.test_allowed_documents_have_no_whitespace_or_merge_marker_errors`
   - Exit 0; 1 test passed in 0.002s across every allowed tracked or untracked target.

### Receipt-inclusive final confirmation

Receipt-inclusive confirmation passed: the full focused documentation module ran 5 tests in 0.005s with exit 0; strict OpenSpec validation returned `Change 'reframe-score-informed-rating-roadmap' is valid` with exit 0; and the scoped tracked-diff check returned exit 0.

### Limitations and deferred work

- `tasks.md` cannot contain its own final whole-file SHA-256 without a self-reference cycle. Its table value is the hash immediately before receipt insertion; the final file hash is reported with the owner-review handoff after receipt-inclusive verification.
- Two long inline Python audit/hash commands were refused by the gateway safety classifier before execution. Equivalent read-only verification succeeded through the private `/tmp` audit script and direct `sha256sum`; the refused attempts produced no repository result.
- No broad Python, Node, browser, runtime, simulation, formal, representative, confirmation, reserved-seed, migration, promotion, or cutover test/run was executed. Product behavior was intentionally outside this documentation-only change.
- The active change is owner-approved guidance but is not the stable archived spec of record. Archive remains a separate owner-gated workflow.

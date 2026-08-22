## Context

See `proposal.md` for motivation and `specs/score-aware-candidate-study/spec.md` for the normative contract.

The production PWA applies winner-only Glicko and uses rating only inside an existing fairness-first matchmaking policy. The preceding scoring-format change establishes prospective structured-score provenance but is still being implemented. Historical product data cannot reveal outcomes for team partitions that were not actually played, so a retrospective model score cannot serve as a direct counterfactual team-balance outcome.

The repository already contains substantial synthetic J1/activity-state infrastructure and frozen evidence. That code is useful only as reference for deterministic artifact discipline; its worlds, negative results, candidate complexity, and evidence cannot be silently reused as this study's confirmatory evidence.

## Goals / Non-Goals

**Goals:**

- Produce an immutable, validator-enforced protocol before any study outcomes.
- Compare production winner-only Glicko with one exact, simple game-level score-aware candidate.
- Keep chronological real-product prediction and direct synthetic closed-loop policy value as separate estimands.
- Make fairness invariants lexical gates rather than weighted objective terms.
- Create content-addressed, deterministic, resumable, fail-closed research artifacts and a mechanically derived decision receipt.

**Non-Goals:**

- Execute any development, smoke, confirmation, formal, reserved-seed, or product-history run under proposal/apply authority alone.
- Add candidate calculations, state, predictions, or storage to the PWA.
- Reuse activity-local state, dense covariance, learned per-player sigma, J1 promotion logic, or IndexedDB.
- Claim causal real-world team-balance effects from historical observational data.
- Authorize a browser shadow, migration, promotion, or production cutover.

## Decisions

### 1. Separate the two evidence arms rather than force one dataset to answer both questions

The product-history arm is chronological and estimates fixed-schedule predictive performance on actually observed games. For each match, both models emit and bind their pre-match forecast before the row's winner or terminal score is revealed. Metric-specific targets, information sets, probability transforms, aggregation, and tie/invalid handling live in the frozen protocol; post-update diagnostics are labeled separately and cannot substitute for forecasts. It can compare endpoint loss, winner prediction, calibration, coverage, and strata, but it cannot observe the outcomes of unplayed candidate/Glicko team assignments.

The direct-value arm is therefore a bounded paired synthetic closed loop with known latent player strength. Comparator and candidate see the same world and attendance schedule, then evolve separately after policy choices diverge. Potential outcomes use keyed/counter-based draws indexed by world, replication, event, and feasible assignment—not a shared mutable RNG stream—so policy order and branch draw counts cannot change the assigned noise. A validated draw ledger makes this auditable. Direct balance uses absolute latent team-strength gap and prespecified tail/severe-imbalance summaries, never either model's own rating gap.

**Alternative considered:** score both policies' proposed teams with a third fitted model on historical data. Rejected because the result remains model-dependent and is not a direct outcome.

**Alternative considered:** immediately randomize real users between policies. Rejected because that would require product behavior, consent/operational, shadow/authority, and safety decisions beyond this research-only change.

### 2. Use a simple game-level candidate as the complexity floor

The protocol artifact, not this design narrative, will bind the exact candidate observation equation, state tuple, constants, initialization, event order, and supported catalog versions. Its allowed inputs are participants, chronological event identity, immutable structured scoring-format snapshot, and terminal score. It retains independent per-player state and no activity-local or covariance state.

Candidate selection can compare a small preregistered development-only grid or a single fixed candidate, but the grid, objective, multiplicity rule, tie rule, and permitted development inputs must be part of the protocol. After the human- and machine-readable protocol agree, implementation stops for owner approval of that exact digest; candidate implementation cannot begin before this freeze gate. Selection emits a content-bound receipt before locked evidence. Only commitments to locked product-test and synthetic-confirmation inputs are public before selection; actual material remains sealed outside the repository and ordinary development workspace.

**Alternative considered:** copy J1-CT-96 into the first candidate. Rejected because it inherits activity-local and covariance complexity before a simple product-native score signal has established value.

### 3. Treat fairness as an exact shared policy shell

Within the synthetic direct-value arm, the comparator and candidate policies call the same versioned fairness-shell interface and exact state projection. The protocol maps each rule to the current production function or names it as an intentional research-only extension; it cannot imply that production already has an undeclared consecutive-play or rotation state. Only the rating signal supplied to the final balance comparison differs. Every synthetic generated proposal records the fairness inputs, outputs, tie resolution, and invariant checks. A single mismatch invalidates the replication rather than entering a weighted trade-off. The product-history predictive arm instead replays the observed schedule and never calls this shell or generates a counterfactual proposal.

**Alternative considered:** optimize a weighted fairness-plus-balance score. Rejected because a favorable average could hide degraded participation/rest behavior, contradicting product priority.

### 4. Bind artifacts by causally ordered identities

The protocol is canonical JSON with a schema/version and SHA-256 digest. A run manifest binds protocol, source revision, runner/validator versions, candidate-selection receipt, frozen data or world-family digest, seed allowlist, and environment facts. Owner execution authority is a separately issued immutable capability, not a manifest boolean; it binds every executable identity and must verify before any sealed input opens. Unit outputs bind their manifest, capability, selection receipt, and unit identity. Aggregates bind the complete validated unit set. The decision receipt is generated only from validated aggregates and records every evidence/authority field separately.

Incomplete units write only to a private manifest-bound resumable workspace. Admission rejects symlinked path components, foreign resume identities, an existing final destination, or failure to acquire an exclusive create/lock before any evaluator runs. Publication uses a staged directory and no-replace atomic rename after complete validation. Existing published artifacts are immutable; amendments or reruns receive new identities.

**Alternative considered:** write summaries directly while running. Rejected because interruption could expose a plausible but incomplete result.

### 5. Require three disjoint execution identity classes

- **Development:** candidate debugging and permitted tuning only.
- **Locked confirmation:** synthetic direct-value evidence; only commitments are public before candidate freeze, and actual seed material requires owner release.
- **Product temporal test:** content-addressed chronological locked slice; only its commitment is public before freeze, and outcome-bearing rows require owner release.

No class is inferred from a numeric seed alone. Protocol and manifest carry explicit class, world/data commitment, and allowlist membership; sealed inputs and the owner-issued capability supply the later reveal. A smoke run, if later authorized, uses a separate non-evidentiary identity and cannot satisfy any gate.

### 6. Make the decision matrix non-compensatory

The protocol will define numeric thresholds or deterministic rules before execution. Required dimensions include product-history predictive performance/evaluability, synthetic median and tail latent balance, severe-imbalance safety, exact fairness, deterministic artifact validation, and sanity controls. Missing or unevaluable required evidence is not a pass. Predictive improvement cannot compensate for failed direct value; direct value cannot compensate for fairness or predictive harm.

A complete pass permits only a recommendation to consider a separately proposed diagnostics-only shadow. It does not advance protocol authority automatically.

### 7. Keep production and research code physically and causally separate

Research/reference code and artifacts live under `analysis/` and `docs/research/` (or a dedicated research artifact root selected by existing repository conventions). Production `src/`, localStorage, CSV, UI, Glicko, matchmaking, and J1 shadow request contracts are protected non-targets. TypeScript parity tooling may be added only if a later task explicitly needs it to validate a pure candidate kernel; it cannot be wired into store or UI in this change.

## Risks / Trade-offs

- **[Risk] Synthetic direct value may not transfer to real users** → Publish world coverage and limitations; keep product-history prediction separate; require a later shadow/trial proposal before any real policy claim.
- **[Risk] A world family favors the chosen candidate** → Freeze ordinary, sparse, roster-churn, misspecified, and stress strata; include oracle and random sanity controls; use locked paired identities.
- **[Risk] Historical cohort is initially too small after prospective snapshot filtering** → Predeclare evaluability floors and return `UNEVALUABLE`; do not backfill or loosen provenance.
- **[Risk] Candidate tuning leaks locked evidence** → Enforce disjoint manifests, access guards, selection receipt, and fail closed on early access.
- **[Risk] Existing simulation infrastructure tempts evidence pooling** → Use new protocol/world/seed identities and explicit provenance; cite old artifacts only for bounded engineering lessons.
- **[Risk] Direct policy trajectories diverge and simple paired per-game comparisons become invalid** → Pair at frozen world/replication level and analyze policy-level summaries, not pooled game rows.
- **[Risk] Exact fairness shell still permits rating-dependent tie effects** → Bind deterministic tie-breaking and record every proposal input/output so differences can be attributed to the rating signal.

## Migration Plan

1. Complete, sync, archive, and verify `define-scoring-format-snapshot-semantics`; no study execution occurs before this gate.
2. Author protocol schema, canonicalizer, and validator with frozen candidate/comparator, cohorts, worlds, metrics, thresholds, partitions, and authority fields.
3. Build deterministic fixtures and reference implementations using only development identities; validate invariants and artifact fail-closed behavior.
4. Freeze candidate selection and emit a content-bound selection receipt.
5. Stop for explicit owner authorization naming the exact permitted product snapshot and run/seed classes.
6. If authorized later, execute bounded units into private workspaces, validate, aggregate, publish atomically, and derive the decision receipt.
7. Rollback before publication deletes only unpublished resumable work. Published protocols, amendments, manifests, artifacts, and receipts are never modified in place.

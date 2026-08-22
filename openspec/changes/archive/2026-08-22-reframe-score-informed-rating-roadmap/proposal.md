## Why

The score-informed rating effort began to distinguish results such as `15:5` and `11:9`, so player strength can converge more accurately and produce better-balanced teams. The accumulated research path now risks treating J1-specific activity shape, dense covariance, and storage infrastructure as product prerequisites even though the current product question can first be tested with simpler game-level, product-native candidates.

## What Changes

- Reframe PWA-Adaptable Rating (PAR) around a falsifiable product question: whether explicit final-score evidence improves future score/outcome prediction and downstream team balancing over the current winner-only Glicko authority. Candidate protocols must measure predictive value and at least one direct product-shaped team-balance outcome without weakening participation/rest fairness.
- Establish a staged roadmap that starts with scoring-format and event semantics, then evaluates the least-complex viable score-aware candidates before considering activity-local state, dense covariance, IndexedDB, migration, or promotion.
- Classify existing J1 parity, shadow, 93-world, and Phase 2A sigma/omega results by their actual evidence scope. J1 engineering and nonformal evidence do not become PAR validation or production authorization; the frozen Phase 2A identification failure remains binding on that exact research path and cannot be relabeled Phase 2B.
- Require future candidate protocols to bind their prospective identity, versions, cohorts/data snapshot, numeric thresholds or deterministic decision rules, tuning boundary, stopping rule, evidence status, and amendment lineage before relevant outcomes are available.
- Establish precedence rules for conflicting repository records: later explicit authority boundaries constrain earlier research decisions without rewriting or deleting historical evidence.
- Define stop/go gates so insufficient product benefit stops or narrows the work rather than automatically increasing model complexity.
- Preserve the current product boundary: Glicko remains the sole rating and matchmaking authority; no rating implementation, migration, user-visible forecast, production cutover, or new simulation execution is included in this change.

## Capabilities

### New Capabilities

- `score-informed-rating-roadmap`: Defines the product objective, staged evidence path, complexity escalation gates, document precedence, and non-authority boundaries for future score-informed rating work.

### Modified Capabilities

_None. There are no archived OpenSpec capabilities yet; legacy repository documents remain historical sources and will be reconciled by this change's documentation tasks._

## Impact

- **Documentation:** `docs/features/score-informed-rating-decision-tree.md`, `docs/features/j1-pwa-method-contract.md`, and `docs/adr/0001-fixed-session-opening-ratings.md` require explicit status/precedence clarification while retaining their historical content and provenance. `docs/adr/0002-rating-runtime-and-j1-shadow-boundary.md` and the U9 milestone record remain authority constraints.
- **OpenSpec:** Introduces the first product-direction capability and a spec-of-record for later score-informed rating proposals.
- **Rating and matchmaking:** No runtime changes. Existing browser TypeScript Glicko remains the sole writer and source for rating, matchmaking, CSV authority, and player-facing values.
- **Persistence and replay:** No localStorage, CSV, IndexedDB, snapshot, replay, or migration implementation is authorized.
- **UI:** No player forecast, PAR rating, speculative delta, or authority change is introduced.
- **Research:** No formal, confirmation, reserved-seed, representative, 93-world, or other simulation run is authorized. Existing J1 and nonformal evidence may inform hypotheses but cannot satisfy PAR-specific promotion gates. The completed Phase 2A sigma/omega gate remains a scoped negative result: it blocks Phase 2B under that protocol, not independently defined PAR questions with new prospective contracts.
- **Dependencies:** No production dependency or backend is added; Python remains offline research/reference tooling only.

## Why

The product now has a defined path toward trustworthy, prospective scoring-format provenance, but it still lacks a preregistered product-shaped study that can determine whether final-score evidence materially improves player-strength estimation and rating-balanced team formation over the current winner-only Glicko authority. The next step is to freeze the simplest valid comparison, cohort, metrics, thresholds, tuning boundary, and stop rules before any relevant study outcomes are generated or inspected.

## What Changes

- Define a versioned, content-bound candidate-study protocol comparing the current winner-only Glicko comparator with at least one simple game-level score-aware candidate that does not require activity-local latent state, connected-player covariance, IndexedDB, or production migration.
- Require eligibility to depend only on prospective product-native records with valid immutable scoring-format snapshots and explicitly defined roster, mode, cold-start, event-order, and legacy-data semantics. Unknown or unsupported formats remain ineligible for structured score evidence and are never inferred from final scores.
- Preregister separate predictive gates and at least one direct product-shaped team-balance gate. Participation, rotation, and rest fairness remain higher-priority constraints and cannot be traded away for rating-balance gains.
- Bind candidate and comparator versions, pre-outcome forecast timing and information sets, data-snapshot identity, cohort rules, metric definitions, numeric thresholds or deterministic decision rules, tuning and holdout boundaries, stopping rules, amendment lineage, and permitted execution scope before relevant outcomes are available.
- Require deterministic replay and an independently checkable offline reference path, while keeping all candidate outputs research-only and outside browser production rating, matchmaking, persistence, CSV, score submission, and player-visible UI authority.
- Publish explicit stop, narrow, reformulate, and bounded-go outcomes. Passing engineering or predictive checks alone cannot authorize browser shadow, added model complexity, migration, promotion, or production cutover.
- Preserve the frozen Phase 2A sigma/omega negative result and the nonformal status of the 93-world/J1 evidence. This study is a new product-native question, not a continuation or rescue of the failed protocol.
- Make execution conditional on successful completion and archive of `define-scoring-format-snapshot-semantics`, an immutable owner-approved protocol digest, an eligible frozen data snapshot, a content-bound candidate-selection receipt, sealed locked-input commitments, and a separately issued owner capability for the exact run/seed scope. A self-authored manifest is not authorization.

## Capabilities

### New Capabilities

- `score-aware-candidate-study`: Defines the prospective product hypothesis, comparator and simple candidate floor, eligible data semantics, predictive and direct team-balance gates, deterministic execution contract, stop/go rules, evidence labels, amendment lineage, and research-only authority boundary.

### Modified Capabilities

_None. This change conforms to `score-informed-rating-roadmap` and consumes `scoring-format-snapshots` as a prerequisite without changing either capability's requirements._

## Impact

- **Research artifacts:** Adds a frozen protocol, validators, deterministic fixtures or reference-oracle contracts, run manifest, and decision receipt for a bounded candidate comparison. No study execution is authorized by proposal creation alone.
- **Product data:** Reads only an explicitly frozen eligible export or content-addressed dataset after scoring-format snapshot semantics are implemented and archived. It does not rewrite local history, infer legacy formats, or create production scientific state.
- **Runtime and authority:** Production Glicko, matchmaking, score submission, localStorage, CSV, UI, and the diagnostics-only J1 shadow remain unchanged. No player-visible prediction or candidate rating is added.
- **Implementation boundary:** Candidate and evaluation code remains offline research/reference tooling unless a later separately approved change proposes a removable product-shaped shadow. Browser Python, backend services, IndexedDB, and authority migration remain out of scope.
- **Evidence and authorization:** Research evidence, engineering determinism/parity, formal inference, safety evaluation, protocol advancement, and production authorization are reported separately. Defaults remain `formal_inference=false`, `safety=NOT_EVALUATED`, `protocol_advancement=false`, and no production authorization unless a later record explicitly changes them.
- **Dependencies:** Requires the archived `score-informed-rating-roadmap` spec and completed, archived `scoring-format-snapshots` capability. It does not introduce a production dependency.

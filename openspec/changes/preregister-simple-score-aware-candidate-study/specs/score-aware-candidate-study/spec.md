## Purpose

Defines a prospective, product-shaped comparison of winner-only Glicko and the least-complex game-level score-aware candidate, separating chronological predictive evidence from a paired synthetic closed-loop team-balance outcome while preserving fairness and production authority boundaries.

## ADDED Requirements

### Requirement: The study protocol is immutable before outcomes
The study MUST publish a versioned, canonical, content-addressed protocol before any relevant study outcome is generated or inspected. The protocol MUST bind the product hypothesis, comparator and candidate versions, scoring semantics, cohort and data-snapshot identity, synthetic-world family, seed partitions, metrics, numeric thresholds or deterministic decision rules, tuning boundary, stopping rules, output schema, amendment lineage, and authorized execution scope.

#### Scenario: Protocol is ready for execution
- **WHEN** all required protocol fields and validators are complete
- **THEN** canonical serialization produces a stable digest, the owner explicitly approves that exact digest before candidate implementation or outcome generation, and every later selection receipt, manifest, artifact, and decision receipt records it

#### Scenario: Outcome-relevant field changes before execution
- **WHEN** a protocol field must change before any relevant outcome is available
- **THEN** a prospective versioned amendment binds the prior digest, identifies the changed fields and reason, and defines whether prior engineering evidence remains admissible

#### Scenario: Outcome-relevant field changes after inspection
- **WHEN** a metric, threshold, cohort, candidate, world, seed partition, or stop rule changes after relevant outcomes are available
- **THEN** the successor is labeled post-outcome exploratory and cannot pass the original prospective gate or authorize its downstream step

### Requirement: Execution waits for product-semantic prerequisites and explicit scope
The study MUST NOT execute until `scoring-format-snapshots` is implemented, synced, archived, and validated; the frozen owner-approved protocol, candidate-selection receipt, and eligible data snapshot exist; and the owner separately issues an immutable execution capability bound to the exact protocol, code, validator, selection-receipt, data/world, execution-class, unit, and seed identities. A self-authored manifest, proposal, artifact, validator, fixture, or runner implementation MUST NOT count as run authorization.

#### Scenario: Scoring-format change remains active
- **WHEN** the scoring-format snapshot capability is incomplete or unarchived
- **THEN** protocol and tooling work may proceed but study execution and result publication remain blocked

#### Scenario: Runner exists without run approval
- **WHEN** deterministic study code and validators are complete but no exact run/seed authorization exists
- **THEN** no synthetic world, product-history evaluation, smoke, confirmation, or formal run is executed

#### Scenario: Manifest claims authorization without an issued capability
- **WHEN** a run manifest marks itself owner-authorized but no independently issued capability matches every bound identity
- **THEN** dispatch fails before opening any outcome-bearing input or generating a world

### Requirement: The first candidate is the least-complex product-native score-aware model
The protocol MUST compare the current winner-only Glicko implementation with at least one exact, versioned game-level score-aware candidate that consumes only participants, event order, final score, and a valid immutable structured scoring-format snapshot. The first candidate MUST NOT require activity-local latent state, dense or connected-player covariance, per-player sigma learning, IndexedDB, backend state, or production migration.

#### Scenario: Candidate identity is frozen
- **WHEN** the protocol names the first candidate
- **THEN** its observation equation, state, initialization, update order, numeric constants, unsupported modes, and canonical implementation/reference identity are fixed before evaluation

#### Scenario: Added complexity is proposed
- **WHEN** activity-local state, covariance, learned sigma, or another larger state model is suggested
- **THEN** it is excluded from this study and requires a later OpenSpec change citing a measured limitation and an incremental gate

### Requirement: Eligible product history uses only trustworthy prospective semantics
Product-history evaluation MUST replay one common chronological event stream. Supported catalog matches provide structured endpoint evidence to the candidate and the same winner-only event to Glicko. Custom, explicit-unknown, legacy-missing, unsupported-version, or unsupported-mode matches MUST provide the same frozen winner-only fallback observation to both histories; malformed records reject the complete input snapshot. No record may be relabeled from score, date, session name, locale, or later defaults.

#### Scenario: Eligible structured match is encountered
- **WHEN** a chronologically replayed match has a supported catalog snapshot and valid endpoint
- **THEN** the candidate may consume its structured score while Glicko consumes the same winner-only event in the same replay position

#### Scenario: Format provenance is unavailable
- **WHEN** a record is custom, unknown, legacy-missing, malformed, or unsupported
- **THEN** malformed input rejects the snapshot, while every otherwise valid unsupported record advances both model histories through the protocol's exact same-event winner-only fallback without structured score evidence or format inference

#### Scenario: Roster or cold-start event occurs
- **WHEN** a player enters, leaves, re-enters, or has no eligible prior candidate observation
- **THEN** the frozen protocol's exact roster and cold-start rule is applied without splitting sessions or inventing prior scientific state

### Requirement: Product-history predictive evaluation is chronological and independent
The product-history arm MUST use a frozen chronological train/tune/test design whose test outcomes and labels are unavailable to candidate selection and threshold setting. It MUST replay the actually observed team schedule and MUST NOT call the synthetic matchmaking/fairness shell or generate counterfactual team proposals. Every scored forecast MUST be emitted and content-bound immediately before the target match outcome or terminal score becomes available, using only the protocol's explicit pre-match information set. The protocol MUST separately define each prediction target, probability transform, loss aggregation, invalid/tie handling, and any post-update diagnostic. It MUST report endpoint predictive loss, winner prediction, calibration, cohort coverage, and prespecified roster/history strata separately for comparator and candidate.

#### Scenario: Historical evaluation begins
- **WHEN** an eligible content-addressed data snapshot is approved for a run
- **THEN** all records are ordered by the frozen event key and allocated by the preregistered chronological boundaries without random game splitting

#### Scenario: Forecast is scored
- **WHEN** the evaluator reaches a locked test match
- **THEN** it records the candidate and comparator pre-match forecasts before revealing that match's winner or terminal score, and post-match state updates cannot replace or alter those forecasts

#### Scenario: Historical schedule is replayed
- **WHEN** the product-history arm evaluates an observed match
- **THEN** both models receive that observed matchup and no fairness-shell call or generated team proposal can affect forecast inputs, event exposure, or eligibility

#### Scenario: Predictive gate passes alone
- **WHEN** the candidate meets predictive thresholds but direct synthetic team-balance is failed or unevaluated
- **THEN** the study does not report product value as passed and cannot authorize shadow, complexity escalation, migration, or promotion

#### Scenario: Coverage is too small
- **WHEN** the locked eligible test cohort or a required stratum is below its preregistered evaluability floor
- **THEN** that gate is `UNEVALUABLE`, not a pass, and the decision matrix follows its frozen narrow-or-stop rule

### Requirement: Direct team-balance value uses a paired synthetic closed loop
The direct product-value arm MUST replay comparator and candidate as separate closed-loop policies in bounded synthetic worlds with known latent player strength. Each paired replication MUST share the frozen world draw and attendance/event schedule while allowing policy-generated matchups and subsequent histories to diverge. Every stochastic potential outcome MUST use a deterministic keyed or counter-based draw whose key is independent of policy evaluation order and branch draw count, and each replication MUST publish a validated draw ledger. The primary balance outcome MUST be computed from latent truth, not either policy's own predicted ratings.

#### Scenario: Policies choose different teams
- **WHEN** comparator and candidate select different team partitions for the same eligible attendees
- **THEN** each policy follows its own closed-loop outcome and update history while the paired world identity and exogenous randomness remain auditable

#### Scenario: Policy execution order changes
- **WHEN** policy evaluation order is reversed or an irrelevant branch changes its draw count
- **THEN** every assignment receives the same keyed potential-outcome variate and the paired policy summaries remain byte-identical

#### Scenario: Direct balance is measured
- **WHEN** a policy produces a team assignment
- **THEN** the artifact records the absolute latent team-strength gap and preregistered tail/severe-imbalance summaries independently of model prediction

#### Scenario: Oracle or random sanity control fails
- **WHEN** the frozen oracle does not dominate as expected or rating-blind random splitting is not materially worse in informative worlds
- **THEN** the affected replication family is invalid and cannot contribute to a pass

### Requirement: Fairness and participation constraints have lexical priority
Comparator and candidate matchmaking policies MUST call one versioned fairness-shell interface with an exact state schema and explicitly mapped production semantics for eligibility, play-count priority, participation, rotation, consecutive-play, volunteer-rest, and deterministic tie-breaking. Any research-only extension MUST be named as a protocol rule rather than implied to be existing production behavior. Every exact fairness invariant MUST pass before rating-balance metrics are considered; no average strength improvement may compensate for a fairness failure.

#### Scenario: Fairness invariant differs
- **WHEN** candidate and comparator differ in eligible players, play-count priority, rest allocation, volunteer-rest handling, or deterministic tie-breaking outside the frozen rating signal
- **THEN** the replication and study gate fail regardless of balance or predictive metrics

#### Scenario: Fairness invariants match
- **WHEN** both policies satisfy every exact fairness check
- **THEN** latent balance differences may be evaluated within the frozen ordinary, sparse-history, roster-churn, and stress strata

### Requirement: Tuning and selection cannot inspect locked evidence
All candidate constants, transforms, and thresholds MUST be selected only within the frozen development boundary. Before selection freeze, only commitments/digests for locked product-test and synthetic-confirmation inputs may be public; actual outcome-bearing data and seed material MUST remain in a capability-separated, owner-released sealed input outside the repository and ordinary development workspace. Every locked manifest, unit, aggregate, and decision receipt MUST bind one candidate-selection receipt digest and exact selected implementation/constants.

#### Scenario: Candidate is tuned
- **WHEN** one or more candidate constants are selected
- **THEN** selection uses only declared development data or development seeds and emits a content-bound selection receipt, including the protocol digest, selected implementation/constants, development-input identities, issuance time, and no-locked-access attestation, before locked input can be released

#### Scenario: Locked evidence is accessed early
- **WHEN** locked test outcomes, confirmation seeds, or aggregate locked metrics are inspected before selection is frozen
- **THEN** the prospective gate is invalidated and any later result is exploratory

#### Scenario: Locked manifest omits the selected receipt
- **WHEN** a locked manifest, unit, aggregate, or decision receipt does not bind and validate the same candidate-selection receipt
- **THEN** execution or publication fails closed

### Requirement: Execution and publication are deterministic and fail closed
The runner, validator, and publisher MUST reject unknown fields, missing counterparts, duplicate identities, nonfinite values, wrong protocol/data/code/selection-receipt digests, unauthorized seeds, partial completion represented as complete, and mismatched metric schemas. Before any provider/evaluator work, publication admission MUST reject an existing final destination, symlink in any workspace/staging/output path component, foreign manifest-bound resume tree, or unavailable exclusive lock. Fixed protocol, code, data, and seed inputs MUST reproduce all non-runtime outputs byte-for-byte.

#### Scenario: Run is interrupted
- **WHEN** a bounded run stops before every required unit and validation completes
- **THEN** resumable work remains unpublished or explicitly partial and no final decision receipt is emitted

#### Scenario: Artifact validation fails
- **WHEN** any manifest, row, aggregate, digest, counterpart, or completion check fails
- **THEN** publication fails closed and no pass/go status is available

#### Scenario: Deterministic replay is repeated
- **WHEN** the same frozen inputs are run twice in an equivalent environment
- **THEN** canonical non-runtime artifacts and decision statuses are byte-identical

### Requirement: Decision outcomes separate evidence and authority
The frozen decision matrix MUST separately report predictive evidence, direct team-balance evidence, fairness, engineering determinism, formal inference, safety evaluation, protocol advancement, shadow authorization, and production authorization. Allowed study outcomes are stop, narrow/reformulate under a new protocol, or bounded evidence supporting consideration of a separate diagnostics-only shadow proposal; none changes Glicko authority.

#### Scenario: Candidate misses a required gate
- **WHEN** predictive, direct-balance, fairness, determinism, or evaluability rules do not satisfy the frozen matrix
- **THEN** Glicko remains sole authority and the receipt records stop, narrow, or reformulate without automatic complexity escalation

#### Scenario: Every research gate passes
- **WHEN** all preregistered research and engineering gates pass
- **THEN** the result may support a new OpenSpec proposal for a removable diagnostics-only shadow but does not authorize that shadow, player-visible output, production writes, migration, or promotion

#### Scenario: Evidence statuses are published
- **WHEN** a decision receipt is finalized
- **THEN** it explicitly preserves `formal_inference=false`, `safety=NOT_EVALUATED`, `protocol_advancement=false`, and no production authorization unless separate controlling records validly change those fields

### Requirement: Historical evidence keeps its original scope
The study MUST identify the frozen Phase 2A sigma/omega result as failed for its exact protocol and J1/93-world evidence as bounded engineering or post-hoc exploratory evidence. It MUST NOT pool, relabel, or use those artifacts to satisfy this study's prospective gates.

#### Scenario: Prior J1 evidence is cited
- **WHEN** parity, browser-shadow, or 93-world artifacts are referenced
- **THEN** they support only their verified compatibility or nonformal claims and contribute no candidate predictive or direct team-balance pass

#### Scenario: Phase 2A is cited
- **WHEN** the new game-level candidate is contrasted with prior activity-state research
- **THEN** the prior failed gate, blocked Phase 2B status, changed estimand, and new protocol identity remain explicit

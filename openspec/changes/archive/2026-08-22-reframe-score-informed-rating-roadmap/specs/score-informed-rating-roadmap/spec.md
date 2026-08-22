## Purpose

Defines how this project frames, evaluates, and authorizes score-informed rating work so product benefit—not inherited research complexity—controls the roadmap.

## ADDED Requirements

### Requirement: Product objective governs score-informed rating work
The roadmap SHALL frame score-informed rating work around the product objective of determining whether final-score evidence improves player-strength estimation and rating-balanced team formation compared with the current winner-only Glicko authority.

#### Scenario: New score-informed rating proposal
- **WHEN** a new score-informed rating change is proposed
- **THEN** its proposal states the product outcome, incumbent comparator, measurable success criteria, and conditions under which the work stops or narrows

#### Scenario: Technique without a product hypothesis
- **WHEN** a proposal is motivated only by adopting J1 structure, activity-local state, covariance, or a storage platform
- **THEN** it is not ready for implementation until it identifies the product hypothesis and evidence that the added technique is needed

### Requirement: Product value includes a direct team-balance outcome
Every candidate-research protocol MUST define at least one direct, product-shaped team-balance measure and its comparison with the incumbent, in addition to predictive score/outcome metrics. The measure MUST evaluate rating-balanced team formation without weakening the product's higher-priority participation, rotation, and rest fairness constraints.

#### Scenario: Candidate protocol defines product-value gates
- **WHEN** a score-aware candidate protocol is proposed
- **THEN** it separately preregisters predictive metrics and at least one direct team-balance measure, including the incumbent comparison and stop/go decision rule for each

#### Scenario: Predictive improvement lacks team-balance evidence
- **WHEN** a candidate improves score or outcome prediction but its team-balance measure is unmet or unevaluated
- **THEN** the roadmap does not represent the original product objective as passed and does not use prediction alone to authorize complexity escalation, shadow, migration, or promotion

### Requirement: Evidence and authorization remain distinct
The roadmap MUST report research evidence, engineering compatibility/non-interference, formal inference, safety evaluation, protocol advancement, and production authorization as separate explicit statuses. J1 parity and browser-shadow results SHALL count only within their verified compatibility and non-interference envelopes, and the 93-world archive MUST remain post-hoc exploratory nonformal evidence rather than PAR validation.

#### Scenario: Reusing J1 evidence
- **WHEN** a future PAR artifact cites J1 parity, shadow, or 93-world evidence
- **THEN** it identifies the bounded claim supported by that evidence and preserves the applicable nonformal, `NOT_EVALUATED`, `protocol_advancement=false`, and non-production statuses without claiming PAR predictive validity

#### Scenario: Promotion claim without a separate decision
- **WHEN** research or engineering gates pass without a separately recorded promotion decision
- **THEN** Glicko remains the sole rating and matchmaking authority

### Requirement: Product-native semantics precede candidate evaluation
Before a PAR candidate is evaluated on product-shaped history, its OpenSpec change MUST explicitly define the scoring-format, event, roster, cold-start, and legacy-data semantics required by that candidate. Missing format metadata MUST remain unknown and MUST NOT be inferred from final scores; absent covariance or other scientific state MUST NOT be fabricated.

#### Scenario: Legacy match lacks a format snapshot
- **WHEN** a historical match has a final score but no immutable scoring-format snapshot
- **THEN** the candidate evaluation treats the format as unknown and does not relabel or reconstruct it from the score

#### Scenario: Dynamic roster history
- **WHEN** history includes late entrants, newly created players, departures, or re-entry
- **THEN** the candidate either defines explicit behavior for those events or declares that history ineligible without silently splitting sessions or inventing prior state

#### Scenario: Unsupported product mode
- **WHEN** a candidate does not yet support singles or another explicit product mode
- **THEN** that mode retains its defined incumbent behavior and is not normalized into a supported mode

### Requirement: Complexity escalates only after simpler candidates are tested
The roadmap SHALL evaluate the least-complex product-native score-aware candidate capable of answering the current product hypothesis before requiring activity-local state, connected-player covariance, IndexedDB state, or whole-history migration. A more complex candidate MUST identify a verified failure or measurable limitation of the simpler candidate and define the incremental benefit it is expected to deliver.

#### Scenario: First product-shaped research slice
- **WHEN** the first PAR candidate set is specified
- **THEN** it includes the current winner-only Glicko comparator and at least one game-level score-aware candidate that supports the scoped product semantics without requiring dense covariance

#### Scenario: Proposal adds dense covariance
- **WHEN** a later proposal adds connected-component or dense player covariance
- **THEN** it cites evidence that the scoped simpler state representation is insufficient and specifies an incremental predictive or matchmaking-value gate plus browser cost limits

#### Scenario: Proposal adds activity-local state
- **WHEN** a later proposal adds activity weighting or activity-local latent state
- **THEN** it defines the product behavior that cannot be represented adequately at game level and tests that claim against a game-level comparator

### Requirement: Roadmap phases have explicit authority gates
Score-informed rating work SHALL be separated into independently authorized phases: roadmap and semantics, bounded candidate research, non-authoritative product-shaped shadow, complexity escalation if justified, and promotion/migration consideration. Completion of one phase MUST NOT automatically authorize the next.

#### Scenario: Candidate research is authorized
- **WHEN** a candidate-research change is approved
- **THEN** that approval does not authorize user-visible predictions, production rating writes, matchmaking changes, persistence migration, or cutover

#### Scenario: Shadow is authorized
- **WHEN** a product-shaped shadow change is approved
- **THEN** the shadow remains removable and diagnostics-only, cannot delay or mutate score submission, and cannot write authoritative rating, matchmaking, CSV, backup, or UI state

#### Scenario: Promotion or migration is proposed
- **WHEN** a change proposes production authority, model transition, IndexedDB migration, or rollback behavior
- **THEN** it requires its own OpenSpec proposal, PAR-specific evidence, explicit owner authorization, and verified recovery semantics

### Requirement: Stop and go decisions are falsifiable
Each candidate-research phase MUST publish a versioned, content-bound protocol before relevant outcomes are available. The protocol MUST identify candidate and comparator versions, product-shaped cohort eligibility and data-snapshot identity, metric definitions, numeric thresholds or deterministic decision rules, tuning/selection boundaries, stopping rules, evidence status, and permitted run/seed scope where applicable. Failure to demonstrate material product value SHALL stop, narrow, or reformulate the candidate rather than automatically trigger additional model complexity.

#### Scenario: Candidate misses its product gate
- **WHEN** a score-aware candidate fails its preregistered predictive or matchmaking-value gate
- **THEN** the decision record keeps Glicko authority and records stop, narrow, or newly formulated research as the available outcomes

#### Scenario: Candidate passes only engineering gates
- **WHEN** parity, determinism, browser runtime, or non-interference passes but the product-value gate is unmet or unevaluated
- **THEN** the candidate remains research or shadow-only

#### Scenario: Evaluation protocol changes after outcomes are available
- **WHEN** a metric, cohort, threshold, comparator, or stopping rule is changed after relevant outcomes are observed
- **THEN** the successor binds the predecessor and records the change as post-outcome exploratory; it is not represented as passing the original prospective gate and cannot alone authorize shadow, complexity escalation, migration, or promotion

#### Scenario: Prospective amendment before relevant outcomes
- **WHEN** a protocol must change before relevant outcomes are available
- **THEN** a versioned amendment binds the predecessor, states the reason and affected fields, defines whether prior evidence remains admissible, and is fixed before execution resumes

### Requirement: Scoped negative research results constrain successor claims
Completed negative research gates MUST retain their original scope, frozen decision rule, and stop boundary. A failed path MUST NOT be restarted by renaming it, pooling incompatible evidence, or weakening its gate after outcomes are known; genuinely new research requires a new preregistered question whose changed estimand or design is explicit.

#### Scenario: Phase 2A sigma/omega result is cited
- **WHEN** future work discusses joint persistent-sigma and activity-local-omega identification
- **THEN** it records that the frozen Phase 2A gate failed, Phase 2B and production implementation under that protocol remain blocked, and Phase 1 evidence is not pooled to overturn that result

#### Scenario: Successor research changes the question
- **WHEN** a successor proposes a different observation design, history length, structural information, or estimand
- **THEN** it receives a new identity and prospective protocol and is not labeled as a pass, continuation, or Phase 2B advancement of the failed Phase 2A path

### Requirement: Historical decision records retain provenance and explicit precedence
Repository documents MUST retain historical decisions and evidence without silent in-place rebinding. When a later authority record limits or supersedes an earlier decision, the affected documents SHALL identify their current status, the controlling later record, and which claims remain historical, active, deferred, or unapproved.

#### Scenario: Earlier ADR implies unauthorized infrastructure
- **WHEN** an earlier accepted ADR describes dense covariance, IndexedDB, migration, or authority behavior that a later boundary explicitly leaves unapproved
- **THEN** the earlier ADR is annotated with a precedence or supersession notice and is not used as implementation authorization

#### Scenario: Historical research decision remains useful
- **WHEN** a constrained or superseded document contains useful research rationale or evidence
- **THEN** the content and provenance are retained while its current authority is stated explicitly

#### Scenario: Active change is not yet the archived spec of record
- **WHEN** this OpenSpec change is under review or implementation but not archived
- **THEN** ADR 0002 and the U9 milestone remain the current runtime authority boundary, while this change is labeled proposed or approved guidance rather than an already-archived controlling spec

#### Scenario: Roadmap change is archived
- **WHEN** owner acceptance, implementation, and verification complete and the change is archived
- **THEN** repository notices identify `openspec/specs/score-informed-rating-roadmap/spec.md` as the stable roadmap spec of record while retaining links to historical authority and evidence

#### Scenario: Frozen evidence has an ambiguity
- **WHEN** a frozen protocol, validator, amendment, or receipt is ambiguous
- **THEN** the ambiguity is resolved through an explicit prospective amendment or later interpretive record rather than modifying the frozen artifact

### Requirement: Every downstream development phase uses OpenSpec
Every new implementation, research protocol, product-semantic change, migration, or promotion phase in the score-informed rating roadmap MUST begin with an OpenSpec change that declares scope, non-goals, dependencies, evidence requirements, and authority effects before execution starts.

#### Scenario: A downstream task is ready to begin
- **WHEN** work would modify behavior, data semantics, research execution, rating state, matchmaking, persistence, or user-visible output
- **THEN** an active validated OpenSpec change covers that work before implementation or execution

#### Scenario: Work falls outside the active change
- **WHEN** a discovered task would expand beyond the active change's declared scope or authority
- **THEN** work stops at the boundary until the current change is updated and re-approved or a separate OpenSpec change is created

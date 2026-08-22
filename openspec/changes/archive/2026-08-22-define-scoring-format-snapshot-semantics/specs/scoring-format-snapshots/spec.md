## Purpose

Defines explicit, outcome-blind scoring-format provenance for product matches so supported endpoints can be validated prospectively while unknown, custom, and legacy records remain distinguishable and are never inferred from final scores.

## ADDED Requirements

### Requirement: Scoring formats use a versioned discriminated snapshot
Every scoring-format snapshot MUST use one versioned, immutable variant: catalog, custom, or unknown. Catalog snapshots MUST bind a stable format identity and version to canonical structured rules. Custom snapshots MUST be explicitly non-catalog and bind their declared structured rules. Unknown snapshots MUST carry an explicit provenance reason and MUST NOT contain invented structured rules.

#### Scenario: Catalog format is selected
- **WHEN** a user selects a supported catalog format
- **THEN** the snapshot records its schema version, stable catalog identity, format version, and canonical `target`, `winBy`, and `cap` rules

#### Scenario: Custom structured format is selected
- **WHEN** a user explicitly defines a non-catalog structured format
- **THEN** the snapshot records the custom classification, immutable display label, schema version, and validated `target`, `winBy`, and `cap` rules without assigning a catalog identity

#### Scenario: Format is explicitly unknown
- **WHEN** no trustworthy structured format is available
- **THEN** the snapshot records `unknown` with a provenance reason and does not copy rules from a default, score, or catalog entry

#### Scenario: Snapshot mixes incompatible variants
- **WHEN** a snapshot combines unknown, custom, or catalog-only fields or does not match its declared schema version
- **THEN** it is malformed and is rejected rather than normalized into another variant

#### Scenario: Snapshot mutation is attempted
- **WHEN** application or UI code retains a session, pending, live, completed, normalized, or imported snapshot reference and attempts to mutate the variant or nested rules
- **THEN** the stored snapshot remains unchanged and no alias can rewrite historical provenance

### Requirement: Structured rules and terminal scores are deterministic
Structured rules MUST use finite positive safe integers with `target >= winBy >= 1` and `cap >= target`. A terminal score under those rules MUST have one winner and nonnegative safe-integer scores. Endpoint branches are disjoint and evaluated by winning score: when the winner equals `target`, including `cap == target`, the loser is at most `target - winBy`; when the winner is above `target` and below `cap`, the margin equals `winBy`; when `cap > target` and the winner equals `cap`, the loser is between `cap - winBy` and `cap - 1` inclusive. Team exchange MUST preserve legality.

#### Scenario: Game ends at target before deuce
- **WHEN** the winner equals `target`, including when `cap == target`, and the loser has at most `target - winBy`
- **THEN** the endpoint is legal under the structured snapshot

#### Scenario: Game extends above target
- **WHEN** the winning score is greater than `target` and less than `cap`
- **THEN** the endpoint is legal only when the winning margin equals `winBy`

#### Scenario: Game reaches cap
- **WHEN** `cap > target` and the winning score equals `cap`
- **THEN** the endpoint is legal only when the loser score is at least `cap - winBy` and less than `cap`

#### Scenario: Structured rules are malformed
- **WHEN** a rule field is missing, non-safe-integer, nonpositive, nonfinite, has `winBy > target`, or has `cap < target`
- **THEN** the format is rejected before it can become a session default, live-match snapshot, completed match, or imported record

### Requirement: Session defaults are explicit and prospective
Every session MUST have an explicit default snapshot, including the deliberate choice of unknown. Creating or activating a session MUST NOT silently infer or preselect a format from scores, dates, names, locale, application version, or another session. Changing the default affects only matches that have not yet started.

#### Scenario: New session chooses a default
- **WHEN** a user creates or activates a session
- **THEN** the product requires an explicit catalog, custom, or unknown choice before a match can start

#### Scenario: Session default changes
- **WHEN** a user changes the session default after one or more matches have started or completed
- **THEN** existing live and completed snapshots remain byte-equivalent and only later matches inherit the new default

#### Scenario: Legacy active session has no default
- **WHEN** existing local data contains an active session without format metadata
- **THEN** it is represented as a `legacy-missing` unknown default and the product requires the user to replace it with a deliberate catalog, custom, or `explicit-unknown` choice before the next match starts, without guessing from its matches

#### Scenario: Legacy prospective choice is cancelled
- **WHEN** the user dismisses or cancels the required choice for a `legacy-missing` active session
- **THEN** the session remains unchanged and the next match cannot start until a deliberate choice is saved

### Requirement: Match snapshots are fixed before outcome reveal
A match MUST receive its own detached scoring-format snapshot before play starts. It MUST copy either the session default or an explicit pre-start match override. The snapshot MUST remain unchanged through score entry, rating update, persistence, display, and export, and MUST NOT be selected or altered after the outcome is known.

#### Scenario: Match uses the session default
- **WHEN** a match starts without an explicit override
- **THEN** it receives a detached copy of the current session default before any score is entered

#### Scenario: Match uses an override
- **WHEN** a user selects a match-level override before starting the match
- **THEN** the live match and completed record use that detached override without changing the session default

#### Scenario: Default changes during a live match
- **WHEN** the session default changes after the match has started
- **THEN** the live match retains its pre-start snapshot

#### Scenario: Override is attempted after outcome entry begins
- **WHEN** a user attempts to select or change the format during or after score submission
- **THEN** the change is unavailable and the score flow retains the pre-start snapshot

### Requirement: Score submission respects the snapshot without changing rating authority
For catalog and custom structured snapshots, score submission MUST reject endpoints that are illegal under the frozen rules before persisting a match, updating ratings, or emitting outcome diagnostics. For unknown snapshots, the product MUST preserve the current generic `Number.isInteger`-compatible requirement of unequal nonnegative integer scores without adding a safe-integer restriction, and MUST label structured endpoint eligibility unavailable. Every accepted match continues to update official ratings only through the current winner-only Glicko path.

#### Scenario: Known structured endpoint is legal
- **WHEN** a submitted score is legal under the match snapshot
- **THEN** the match is stored with that exact snapshot and Glicko receives only the winner/loser result it currently consumes

#### Scenario: Known structured endpoint is illegal
- **WHEN** a submitted score is not a legal terminal endpoint under the match snapshot
- **THEN** submission fails before match persistence, rating mutation, shadow outcome delivery, or UI completion

#### Scenario: Unknown-format endpoint is submitted
- **WHEN** the match snapshot is unknown and the scores are unequal nonnegative integers
- **THEN** the match may complete through winner-only Glicko while structured-format and score-aware eligibility remain unavailable

#### Scenario: Validation fails
- **WHEN** score or snapshot validation fails
- **THEN** match history, official rating state, matchmaking inputs, CSV authority, and diagnostics remain unchanged

### Requirement: Legacy absence is unknown and explicit corruption fails closed
Local or CSV records that predate this capability and omit scoring-format fields MUST load as explicit unknown snapshots with legacy provenance. The system MUST NOT infer missing fields. A record that declares a snapshot but contains malformed, unsupported-schema, contradictory, or partially missing snapshot fields MUST fail the enclosing restore atomically rather than downgrade to unknown.

#### Scenario: Old record omits snapshot columns
- **WHEN** a legacy local or CSV match has no scoring-format representation
- **THEN** it loads with an explicit legacy-missing unknown snapshot and retains its original teams, scores, time, and winner-only rating semantics

#### Scenario: Old session omits a default
- **WHEN** a legacy session has no scoring-format representation
- **THEN** it loads with an explicit legacy-missing unknown default without modifying its matches

#### Scenario: Declared snapshot is malformed
- **WHEN** an import contains an explicit snapshot whose fields fail its variant or schema contract
- **THEN** the complete import is rejected before replacing any current application data

#### Scenario: Declared structured snapshot contradicts its endpoint
- **WHEN** a local or CSV completed match contains a structurally valid catalog or custom snapshot but its stored score is not a legal terminal endpoint under that snapshot
- **THEN** the complete load or import is rejected without downgrading the snapshot to unknown or replacing current application data

#### Scenario: Score resembles a catalog format
- **WHEN** a legacy unknown match has a score that is legal under one or more catalog formats
- **THEN** it remains unknown and no format identity or rule tuple is assigned

### Requirement: Local persistence and CSV round-trip preserve exact provenance
Browser-local persistence and CSV backup/restore MUST preserve every session default and completed-match snapshot exactly, including variant, schema version, identity/version or custom rules, and unknown provenance. Export followed by import MUST reconstruct equivalent scoring-format data without silently upgrading identities or replacing unknown values with later defaults.

#### Scenario: New-format data round-trips
- **WHEN** data containing catalog, custom, and unknown snapshots is exported and imported
- **THEN** every session and match reconstructs an equivalent snapshot and all existing non-format data remains equivalent

#### Scenario: Catalog definition later changes
- **WHEN** application code contains a newer catalog definition than an old completed snapshot
- **THEN** the old match retains its stored identity, version, and rule tuple rather than being rebound to the newer definition

#### Scenario: Import mixes legacy and new rows
- **WHEN** a valid backup contains rows without snapshot fields and rows with valid explicit snapshots
- **THEN** legacy rows become explicit unknown while explicit rows retain their exact snapshots

#### Scenario: CSV structure is ambiguous
- **WHEN** a known CSV section or header is duplicated, a known-section row width differs from its header, or more than one format column could apply to a row
- **THEN** the complete import is rejected before snapshot decoding or application-data replacement

#### Scenario: CSV exceeds the browser import budget
- **WHEN** a CSV exceeds 5 MiB of UTF-8, 50,000 records, or 64 KiB in any decoded field
- **THEN** it is rejected at the earliest available boundary without replacing active storage, reactive application data, or ready/blocked recovery state

#### Scenario: Local normalization fails
- **WHEN** the active local value contains malformed explicit scoring-format data or a contradictory known endpoint
- **THEN** the raw value is preserved, automatic persistence remains disabled, and the product enters a blocking recovery state rather than writing empty or partially normalized data

#### Scenario: Required backup cannot be verified
- **WHEN** an existing active local value requires its one-time pre-format backup and backup write or exact readback verification fails
- **THEN** the active value remains unchanged, no enriched write is attempted, and the product enters blocking recovery

#### Scenario: Recovery succeeds
- **WHEN** the user restores a completely valid CSV backup or explicitly confirms discarding the blocked local value after downloading or preserving it
- **THEN** the complete replacement is committed before persistence is re-enabled and the recovery state becomes ready

#### Scenario: Recovery is cancelled or fails
- **WHEN** the user dismisses recovery, cancels destructive discard, or supplies an invalid replacement
- **THEN** the original raw value remains preserved, application data is not replaced, and automatic persistence stays disabled

### Requirement: Completed format provenance is read-only in this change
Completed-match snapshots MUST be displayed as historical provenance and MUST NOT be edited by this capability. Score edits MUST be validated against the existing frozen snapshot. Any future format-correction workflow requires a separate OpenSpec change that defines audit, mutable-tail replay, sealed-history behavior, and rating-effect boundaries before enabling correction.

#### Scenario: User views match history
- **WHEN** a completed match is displayed
- **THEN** its catalog, custom, or unknown status is visible without presenting unknown provenance as a known format

#### Scenario: User edits a score
- **WHEN** a score correction is allowed by existing history behavior
- **THEN** the corrected score must remain legal under the match's unchanged snapshot or the edit is rejected without rating mutation

#### Scenario: User attempts to edit completed format
- **WHEN** a completed match has an incorrect or missing format snapshot
- **THEN** this capability offers no in-place format edit and does not reinterpret the historical record

### Requirement: Rating, matchmaking, and research authority remain unchanged
Scoring-format metadata MUST NOT alter official rating equations, matchmaking priorities, player-visible rating output, or J1/PAR authority. Glicko remains winner-only and the sole production rating and matchmaking authority. The metadata MAY be cited as prospective eligibility input only by a later independently approved OpenSpec research change.

#### Scenario: Snapshot variants differ for the same winner
- **WHEN** two otherwise equivalent accepted matches have different valid format snapshots but the same winner and participants
- **THEN** the official Glicko update uses the same winner-only observation path

#### Scenario: Format metadata becomes available
- **WHEN** prospective matches accumulate explicit snapshots
- **THEN** no score-aware evaluation, shadow, promotion, simulation, or authority transition begins without a separate approved OpenSpec change

#### Scenario: Browser operation is offline
- **WHEN** the capability is used in the PWA
- **THEN** all selection, validation, persistence, display, and export behavior executes in browser TypeScript without a backend or browser Python runtime

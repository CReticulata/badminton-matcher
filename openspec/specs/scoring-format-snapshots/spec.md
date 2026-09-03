# scoring-format-snapshots Specification

## Purpose
TBD - created by archiving change port-scoring-format-snapshots. Update Purpose after archive.
## Requirements
### Requirement: Scoring formats use a versioned discriminated snapshot

Every scoring-format snapshot MUST use exactly one versioned, immutable variant: `catalog`, `custom`, or `unknown`. Catalog snapshots MUST bind a stable identity and version to copied canonical rules. Custom snapshots MUST carry a display label and their declared rules without a catalog identity. Unknown snapshots MUST carry a provenance reason and MUST NOT contain rule fields.

#### Scenario: Catalog format is selected
- **WHEN** a user selects a supported catalog format
- **THEN** the snapshot records its schema version, stable catalog identity, format version, and copied `target`, `winBy`, and `cap`

#### Scenario: Custom structured format is selected
- **WHEN** a user explicitly defines a non-catalog structured format
- **THEN** the snapshot records the custom classification, an immutable trimmed label of 1–40 Unicode code points, and validated rules, with no catalog identity

#### Scenario: Format is explicitly unknown
- **WHEN** no trustworthy structured format is available
- **THEN** the snapshot records `unknown` with reason `explicit-unknown` or `legacy-missing` and copies no rules from a default, score, or catalog entry

#### Scenario: Snapshot mixes incompatible variants
- **WHEN** a snapshot combines fields from more than one variant, omits a required field, or declares an unsupported schema version
- **THEN** it is malformed and is rejected rather than normalized into another variant

#### Scenario: Snapshot mutation is attempted
- **WHEN** any code retains a reference to a stored session, pending, live, completed, or imported snapshot and attempts to mutate the variant or nested rules
- **THEN** the stored snapshot is unchanged and no alias can rewrite historical provenance

### Requirement: Structured rules and terminal scores are deterministic

Structured rules MUST be finite positive safe integers with `winBy <= target <= cap`, and MUST be able to terminate: when `cap` equals `target`, `winBy` MUST be 1, because otherwise a game tied at `target - 1` has no reachable legal endpoint. A terminal score MUST have one winner and nonnegative safe-integer scores. The endpoint branches are disjoint and selected by the winning score: when the winner equals `target`, including when `cap == target`, the loser is at most `target - winBy`; when the winner is above `target` and below `cap`, the margin equals `winBy`; when `cap > target` and the winner equals `cap`, the loser is at least `cap - winBy` and less than `cap`. Exchanging the two teams MUST preserve legality.

#### Scenario: Game ends at target before deuce
- **WHEN** the winner equals `target`, including when `cap == target`, and the loser has at most `target - winBy`
- **THEN** the endpoint is legal

#### Scenario: Game extends above target
- **WHEN** the winning score is greater than `target` and less than `cap`
- **THEN** the endpoint is legal only when the winning margin equals `winBy`

#### Scenario: Game reaches cap
- **WHEN** `cap > target` and the winning score equals `cap`
- **THEN** the endpoint is legal only when the loser is at least `cap - winBy` and less than `cap`

#### Scenario: Structured rules are malformed
- **WHEN** a rule field is missing, non-safe-integer, nonpositive, nonfinite, has `winBy > target`, or has `cap < target`
- **THEN** the format is rejected before it can become a session default, live snapshot, completed match, or imported record

#### Scenario: Structured rules cannot terminate
- **WHEN** `cap` equals `target` and `winBy` is greater than 1
- **THEN** the format is rejected, because a game tied at `target - 1` could never reach a legal endpoint

#### Scenario: Sudden death at the target is allowed
- **WHEN** `cap` equals `target` and `winBy` is 1
- **THEN** the format is accepted and a win at `target` against `target - 1` is a legal endpoint

### Requirement: Session defaults are explicit and prospective

Every session MUST carry a default snapshot recorded as a deliberate catalog, custom, or unknown value. A new session MAY be pre-filled with one fixed product default; that default MUST be a constant, MUST be visible before the first match starts, and MUST be replaceable without starting a match. A default MUST NOT be derived from scores, dates, names, locale, application version, or another session. Changing a default MUST affect only matches that have not yet started.

#### Scenario: New session uses the product default
- **WHEN** a user creates a session without changing the format
- **THEN** the session records the fixed product default as a catalog snapshot, and that value is shown before any match can start

#### Scenario: User replaces the default before starting
- **WHEN** a user changes the format while creating a session
- **THEN** the session records that choice instead of the product default

#### Scenario: Product default is never applied to existing data
- **WHEN** local or CSV data contains a session or match without format metadata
- **THEN** it loads as `legacy-missing` and the product default is not written into it

#### Scenario: Session default changes
- **WHEN** a user changes the default after matches have started or completed
- **THEN** existing live and completed snapshots are unchanged and only later matches inherit the new default

#### Scenario: Legacy active session has no default
- **WHEN** existing local data contains an active session without format metadata
- **THEN** it loads as a `legacy-missing` unknown default and the product requires a deliberate replacement choice before the next match starts, without guessing from its matches

#### Scenario: Legacy prospective choice is cancelled
- **WHEN** the user dismisses the required choice for a `legacy-missing` active session
- **THEN** the session is unchanged and the next match cannot start until a deliberate choice is saved

### Requirement: Live match scoring format may be replaced before completion

A match MUST receive its own detached scoring-format snapshot before play starts, copied from the session default or an explicit pre-start override. While the match remains live, a user MUST be able to replace that snapshot from the live-match display or score-entry flow through one store-owned command. The command MUST bind the request to the expected live-match identity, require the reactive and recoverable live authorities to match that identity, and return a distinguishable success or refusal result. A replacement MUST preserve the live-match identity, participants, resters, start boundary, fairness lineage, and session default; it MUST affect no later match. The live snapshot MAY be replaced repeatedly before completion. A replacement MUST commit only after persistence succeeds. Persistence failure MUST restore both prior live authorities, expose the persistence warning, and report refusal. The most recently committed snapshot MUST survive recovery and MUST be the only snapshot copied to the completed record and used for endpoint validation and Rating observation.

#### Scenario: Match uses the session default
- **WHEN** a match starts without an override
- **THEN** it receives a detached copy of the current session default before any score exists

#### Scenario: Match uses a pre-start override
- **WHEN** a user selects an override before starting the match
- **THEN** the live match begins with that detached override and the session default is unchanged

#### Scenario: Session default changes during a live match
- **WHEN** the session default changes after the match has started
- **THEN** the live match retains its own current snapshot and only later matches inherit the new default

#### Scenario: Format is replaced from the live-match display
- **WHEN** a user saves a different supported snapshot from the live-match display
- **THEN** the same live match continues with the replacement, while its identity, lineup, resters, start boundary, fairness lineage, and session default remain unchanged

#### Scenario: Format is replaced repeatedly
- **WHEN** a user saves more than one live-format replacement before completion
- **THEN** every replacement succeeds in order and the most recently saved snapshot is the current authority

#### Scenario: Saved replacement is reloaded
- **WHEN** the application reloads after a live-format replacement and before match completion
- **THEN** recovery restores the same live match with the replacement snapshot and no prior live snapshot is reconstructed

#### Scenario: Replacement targets stale or inconsistent live authority
- **WHEN** a replacement names a live-match identity that is missing or differs between the reactive and recoverable live authorities
- **THEN** the command reports refusal and changes neither authority

#### Scenario: Replacement persistence fails
- **WHEN** both live authorities are valid and matching but local persistence rejects the replacement write
- **THEN** the command reports persistence failure, restores independent copies of both prior live authorities, and exposes the existing persistence warning

#### Scenario: Match completes after replacement
- **WHEN** a final score is submitted after one or more live-format replacements
- **THEN** the score is validated and rated only under the most recently saved snapshot, and the completed record contains only that snapshot

#### Scenario: Format draft is cancelled
- **WHEN** a user opens a live-format picker but cancels without saving
- **THEN** the live match, session default, score-entry state, and persisted snapshot remain unchanged

### Requirement: Score drafts are cleared deliberately when the live format changes

The live match MUST retain one shared transient, non-persisted score-entry state bound to its live-match identity while score entry is hidden. Both the live-match display and score-entry format actions MUST reconcile and inspect that same state. Visibility changes for the same identity MUST retain it. Completion, cancellation, session replacement, successful import, recovery, or any other transition to a different or absent active live identity MUST clear it before the new context can use score entry or format replacement. When either score field is non-empty, saving a different snapshot from either entry MUST first warn that both score fields will be cleared. Confirmation MUST invoke the identity-bound replacement and MUST clear both score fields, validation errors, and any force-unrated prompt only after the command reports durable success for the expected live match. Declining or any command refusal MUST preserve the prior snapshot and complete score-entry state. When both score fields are empty, the replacement MUST apply without a score-clearing warning.

#### Scenario: Blank score form changes format
- **WHEN** both score fields are empty and the user saves a different live snapshot
- **THEN** the replacement applies without a score-clearing warning and the blank form remains ready for input

#### Scenario: Non-empty score form confirms replacement
- **WHEN** either score field is non-empty, the user saves a different live snapshot, and confirms the clearing warning
- **THEN** the replacement applies and both score fields, validation errors, and any force-unrated prompt are cleared

#### Scenario: Retained score draft changes format from the live display
- **WHEN** either score field is non-empty, the user returns to the live-match display, saves a different snapshot there, and confirms the clearing warning
- **THEN** the replacement commits for the same live match before both score fields, validation errors, and any force-unrated prompt are cleared

#### Scenario: Non-empty score form declines replacement
- **WHEN** either score field is non-empty, the user saves a different live snapshot, and declines the clearing warning
- **THEN** the prior snapshot, both score fields, validation error, and any force-unrated prompt remain unchanged

#### Scenario: Confirmed replacement is refused
- **WHEN** either score field is non-empty, the user confirms a replacement, and the store command refuses because authority is stale, blocked, missing, inconsistent, or cannot be persisted
- **THEN** the prior snapshot, both score fields, validation error, and any force-unrated prompt remain unchanged, and a persistence failure remains visibly reported

#### Scenario: Score-entry format draft is cancelled
- **WHEN** a user changes picker selections but cancels before saving
- **THEN** the prior live snapshot and complete score-entry state remain unchanged

#### Scenario: Active live identity is replaced by import or recovery
- **WHEN** transient score-entry state belongs to one live match and a successful import or recovery installs a different or absent active live identity
- **THEN** the prior raw scores, validation error, and any force-unrated prompt are cleared before the imported or recovered context can use score entry or format replacement

### Requirement: Score submission respects the snapshot without changing rating authority

For catalog and custom snapshots, score submission MUST reject endpoints that are illegal under the frozen rules before persisting the match and before any rating update. For unknown snapshots, the existing generic requirement of unequal nonnegative integer scores MUST be preserved without adding a safe-integer restriction. Every accepted match MUST continue to update ratings only through Glicko-2, whose update equations, tau, rating deviation, volatility, and initial ratings are unchanged; the frozen snapshot MAY determine the observed score supplied to those equations.

#### Scenario: Known structured endpoint is legal
- **WHEN** a submitted score is legal under the match snapshot
- **THEN** the match is stored with that exact snapshot and Glicko receives an observed score derived from that snapshot and the final score

#### Scenario: Known structured endpoint is illegal
- **WHEN** a submitted score is not a legal terminal endpoint under the match snapshot
- **THEN** submission fails before match persistence and before rating mutation, and the product offers to record the match as unrated instead

#### Scenario: Unknown-format endpoint is submitted
- **WHEN** the match snapshot is unknown and the scores are unequal nonnegative integers
- **THEN** the match completes through the winner-only path and structured endpoint eligibility is reported unavailable

#### Scenario: Two formats share a winner
- **WHEN** two otherwise equivalent accepted matches have different valid snapshots but the same participants and winner
- **THEN** the resulting ratings MAY differ, because the observed score depends on the snapshot; both are still produced by the unchanged Glicko-2 equations

#### Scenario: Two unknown-format matches share a winner
- **WHEN** two otherwise equivalent accepted matches both have unknown snapshots and the same participants and winner
- **THEN** the resulting rating, RD, and volatility are identical regardless of margin

### Requirement: An illegal endpoint may be recorded only as an unrated match

After an illegal endpoint has been reported, the product MAY offer to record the match anyway. Such a match MUST be marked unrated by an explicit stored flag, MUST NOT contribute to any rating calculation in live update, replay, recalculation, or session summary, and MUST still count toward participation, rotation, and rest statistics. The offer MUST NOT bypass the shared requirement of unequal nonnegative integer scores. A match MUST NOT become unrated without a deliberate action for that match.

#### Scenario: Illegal endpoint is force-recorded
- **WHEN** the user confirms recording a score that is illegal under the match snapshot
- **THEN** the match is stored with its frozen snapshot and an explicit unrated flag, and every player's rating, RD, and volatility are unchanged

#### Scenario: Unrated match is replayed
- **WHEN** ratings are recalculated or a session is replayed from its opening snapshot
- **THEN** the unrated match is skipped, and the resulting states equal those obtained from the rated matches alone

#### Scenario: Unrated match and fairness
- **WHEN** participation, rotation, consecutive-play, or rest statistics are computed
- **THEN** the unrated match counts exactly like any other completed match

#### Scenario: Force does not bypass shared score rules
- **WHEN** the user attempts to force-record a tie or a negative score
- **THEN** it is rejected and no match is stored

#### Scenario: Unrated match is reloaded
- **WHEN** stored or imported data contains a match whose score is illegal under its structured snapshot
- **THEN** it loads successfully if and only if it carries the explicit unrated flag; without the flag it is corruption and the enclosing load or import is rejected

#### Scenario: Unrated score is corrected
- **WHEN** an unrated match's score is edited to one that is legal under its unchanged snapshot
- **THEN** the unrated flag is cleared and the match resumes contributing to ratings

#### Scenario: Unrated score is edited to another illegal score
- **WHEN** an unrated match's score is edited to another score that is illegal under its unchanged snapshot
- **THEN** the edit is accepted without a further confirmation and the match remains unrated

#### Scenario: Rated match is edited to an illegal score
- **WHEN** a rated match's score is edited to one that is illegal under its unchanged snapshot
- **THEN** the edit is rejected until the user deliberately confirms recording it as unrated

### Requirement: Score edits preserve the frozen snapshot and the replay boundary

Editing a completed match's score MUST validate the new score against that match's unchanged snapshot before any mutation or recalculation. Format validation MUST NOT change which events replay, the session opening snapshot used as the replay start, or the rule that a session's replay does not cross into the next session.

#### Scenario: Edited score is legal under the frozen snapshot
- **WHEN** a history score edit is legal under the match's stored snapshot
- **THEN** the edit proceeds and replay runs exactly as it does today, from the session opening snapshot and bounded by the next session

#### Scenario: Edited score is illegal under the frozen snapshot
- **WHEN** a history score edit is illegal under the match's stored snapshot
- **THEN** the edit is rejected and match history, rating state, and replay results are unchanged

#### Scenario: Edited legacy match has an unknown snapshot
- **WHEN** a history score edit targets a `legacy-missing` match
- **THEN** the existing generic score validation applies and the snapshot stays `legacy-missing`

### Requirement: Legacy absence is unknown and declared corruption fails closed

Local or CSV records that predate this capability and omit format fields MUST load as explicit unknown snapshots with `legacy-missing` provenance. Missing fields MUST NOT be inferred. A record that declares a snapshot but contains malformed, unsupported-schema, contradictory, or partially missing fields MUST fail the enclosing load or import atomically rather than downgrading to unknown.

#### Scenario: Old record omits format columns
- **WHEN** a legacy local or CSV match has no format representation
- **THEN** it loads with a `legacy-missing` unknown snapshot and keeps its original teams, scores, time, resters, and winner-only rating semantics

#### Scenario: Score resembles exactly one catalog format
- **WHEN** a legacy unknown match has a score that is legal under one or more catalog formats
- **THEN** it remains unknown and no identity or rule tuple is assigned

#### Scenario: Declared snapshot is malformed
- **WHEN** a load or import contains an explicit snapshot whose fields fail its variant or schema contract
- **THEN** the complete load or import is rejected before replacing any current application data

#### Scenario: Declared snapshot contradicts its stored endpoint
- **WHEN** a completed match carries a structurally valid catalog or custom snapshot but its stored score is not a legal terminal endpoint under it
- **THEN** the complete load or import is rejected without downgrading the snapshot to unknown

### Requirement: Malformed local data is preserved behind a blocking recovery state

Local normalization MUST complete before reactive data is exposed and before automatic persistence is enabled. When normalization fails, the raw stored value MUST be preserved, automatic persistence MUST stay disabled, and the product MUST enter a blocking recovery state. Every data-mutating command MUST be unavailable at the store boundary itself, not only hidden from the interface; only the recovery actions may proceed. The existing persistence-failure warning remains a separate signal for write failures and MUST NOT be replaced by recovery state.

#### Scenario: Local value cannot be normalized
- **WHEN** the active local value contains malformed explicit format data or a contradictory known endpoint
- **THEN** the raw value is preserved unchanged, the deep persistence watcher does not write, and a blocking recovery screen replaces normal product actions

#### Scenario: A mutating command is invoked while blocked
- **WHEN** any command that would add, edit, or remove players, sessions, matches, ratings, or history is invoked while the product is blocked
- **THEN** it performs no mutation, reports its unavailability through its own return contract, and writes nothing to local storage

#### Scenario: Recovery succeeds
- **WHEN** the user restores a completely valid CSV backup, or explicitly confirms discarding the blocked value after downloading it
- **THEN** the replacement is committed atomically before persistence is re-enabled and the state becomes ready

#### Scenario: Recovery is cancelled or fails
- **WHEN** the user dismisses recovery, cancels the destructive discard, or supplies an invalid replacement
- **THEN** the raw value is preserved, application data is not replaced, and persistence stays disabled

#### Scenario: Write failure is not a recovery state
- **WHEN** normalization succeeded but a later `localStorage` write fails
- **THEN** the existing persistence warning is shown, data stays in memory, and the product does not enter blocking recovery

### Requirement: Local persistence and CSV round-trip preserve exact provenance

Browser-local persistence and CSV backup/restore MUST preserve every session default and completed-match snapshot exactly, including variant, schema version, identity and version or custom rules, and unknown provenance. Export followed by import MUST reconstruct equivalent data without upgrading identities or replacing unknown values with later defaults, and MUST preserve all existing fields, including opening snapshots, participant order reliability, archive timestamps, overrides, and baselines.

#### Scenario: New-format data round-trips
- **WHEN** data containing catalog, custom, and unknown snapshots is exported and imported
- **THEN** every session and match reconstructs an equivalent snapshot and all existing non-format data remains equivalent

#### Scenario: Catalog definition later changes
- **WHEN** application code contains a newer catalog definition than an old completed snapshot
- **THEN** the old match retains its stored identity, version, and rule tuple rather than being rebound

#### Scenario: Import mixes legacy and new rows
- **WHEN** a valid backup contains rows without format columns and rows with valid explicit snapshots
- **THEN** legacy rows become `legacy-missing` unknown and explicit rows retain their exact snapshots

#### Scenario: CSV structure is ambiguous
- **WHEN** a known section or header is duplicated, or a known-section row width differs from its header
- **THEN** the complete import is rejected before snapshot decoding or data replacement

#### Scenario: CSV exceeds the browser import budget
- **WHEN** a CSV exceeds 5 MiB of UTF-8, 50,000 records, or 64 KiB in any decoded field
- **THEN** it is rejected at the earliest available boundary without replacing storage, reactive data, or recovery state

### Requirement: Completed format provenance is read-only

Completed-match snapshots MUST be displayed as historical provenance and MUST NOT be editable by this capability. Any future correction workflow requires a separate change defining audit, replay, and rating-effect boundaries.

#### Scenario: User views match history
- **WHEN** a completed match is displayed
- **THEN** its catalog, custom, or unknown status is visible and unknown provenance is not presented as a known format

#### Scenario: User attempts to edit a completed format
- **WHEN** a completed match has a wrong or missing snapshot
- **THEN** no in-place format edit is offered and the historical record is not reinterpreted

### Requirement: Archived players do not affect format provenance

Archiving and restoring a player MUST NOT change any snapshot. Historical matches involving archived players MUST retain their exact provenance and remain exportable.

#### Scenario: Player is archived after playing
- **WHEN** a player with completed matches is archived
- **THEN** those matches keep their snapshots and CSV export preserves them unchanged

#### Scenario: Archived player is restored
- **WHEN** an archived player is restored
- **THEN** no snapshot changes and future matches inherit the current session default like any other participant


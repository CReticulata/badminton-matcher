## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Match snapshots are fixed before outcome reveal

**Reason**: RW-56 deliberately permits a live match to replace its scoring format when changing court availability requires the group to shorten or extend play. The former prohibition on any post-start replacement conflicts with that product behavior.

**Migration**: Existing pending, live, completed, imported, and legacy snapshots retain their exact values. No stored record is rewritten. Future live matches may replace the whole current snapshot before completion; completed snapshots remain read-only and only the final live snapshot is persisted into history.

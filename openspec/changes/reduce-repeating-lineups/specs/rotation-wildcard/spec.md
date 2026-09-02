## Purpose

Defines a conditional, auditable one-seat rotation wildcard that reduces repeating lineups without replacing normal time-normalized fairness or Rating-balanced team splitting.

## ADDED Requirements

### Requirement: Rotation wildcard is eligible only for a two-round lineup repeat
The system MUST first produce a normal proposal using the approved time-normalized fairness and team-balance rules. It MUST consider a rotation wildcard only when the normal playing set is exactly equal, without regard to team assignment or order, to the actual playing set of the completed match two chronological matches earlier in the same active session. Fewer than two completed matches, a different playing set, an active wildcard cooldown, fairness-degraded mode, or no eligible replacement candidate MUST make the normal proposal final without a wildcard draw.

#### Scenario: Eight-person alternating sets would repeat
- **WHEN** a normal doubles proposal would contain exactly the same four participants as the completed match two matches earlier
- **THEN** the proposal is eligible for the doubles wildcard draw

#### Scenario: Team assignment changed but playing set repeated
- **WHEN** the normal proposal contains the same playing set as two matches earlier but assigns different teams
- **THEN** the proposal is still treated as a two-round lineup repeat

#### Scenario: Normal lineup already varies
- **WHEN** the normal playing set differs from the completed match two matches earlier
- **THEN** the system returns the normal proposal without drawing a wildcard

#### Scenario: Not enough completed history
- **WHEN** the active session has fewer than two completed matches
- **THEN** the system returns the normal proposal without drawing a wildcard

#### Scenario: Mixed modes cannot form an equal set
- **WHEN** the current normal proposal and the match two chronological matches earlier contain different numbers of players
- **THEN** their sets are not equal and no wildcard draw occurs

### Requirement: Each eligible generation performs an independent mode-specific draw
For every eligible proposal generation, including every explicit regeneration, the system MUST perform a new independent draw using the injected random source. The draw probability MUST be 25 percent for doubles and 12.5 percent for singles. A missed draw MUST leave the normal proposal unchanged and MUST NOT start cooldown. The first version MUST expose neither probability nor cooldown duration as user settings.

#### Scenario: Doubles proposal is eligible
- **WHEN** an eligible doubles proposal is generated and the draw falls within the first 25 percent of the random interval
- **THEN** the system applies one rotation wildcard exchange

#### Scenario: Singles proposal is eligible
- **WHEN** an eligible singles proposal is generated and the draw falls within the first 12.5 percent of the random interval
- **THEN** the system applies one rotation wildcard exchange

#### Scenario: User regenerates an eligible proposal
- **WHEN** the user regenerates a proposal that still meets the repeat condition and cooldown is inactive
- **THEN** the system performs a new independent draw rather than reusing the prior result

#### Scenario: Seeded random source is repeated
- **WHEN** identical state, evaluation time, mode, and seeded random source are supplied
- **THEN** the normal proposal, draw result, exchange, and teams are identical

### Requirement: A successful wildcard replaces exactly one normal seat
On a successful draw, the system MUST uniformly select one participant from the normal playing set to exchange out and uniformly select one participant from the other currently eligible non-voluntary-rest participants to exchange in. The exchange-in pool MUST exclude everyone in the normal playing set, everyone absent, and everyone on voluntary rest. The system MUST NOT replace more than one seat. If either pool has no valid member, the wildcard MUST be treated as not applied.

#### Scenario: Doubles wildcard succeeds with additional eligible participants
- **WHEN** an eligible doubles draw succeeds and at least one eligible participant is outside the normal four
- **THEN** exactly one normal player rests, exactly one normal rester plays, and the other three normal players remain selected

#### Scenario: Singles wildcard succeeds with an additional eligible participant
- **WHEN** an eligible singles draw succeeds and at least one eligible participant is outside the normal two
- **THEN** exactly one normal player rests and exactly one normal rester plays

#### Scenario: Match has no replacement candidate
- **WHEN** doubles has exactly four eligible participants or singles has exactly two
- **THEN** no wildcard exchange or cooldown-producing metadata is created

#### Scenario: Voluntary rester is outside the normal lineup
- **WHEN** a participant is on voluntary rest during an otherwise eligible wildcard draw
- **THEN** that participant cannot be selected as the exchange-in player

#### Scenario: Random selection repeats a prior exchange-out participant
- **WHEN** an independently seeded draw selects a participant who was exchanged out by an earlier wildcard
- **THEN** the exchange is allowed and no anti-repeat bag or victim exclusion changes the uniform draw

### Requirement: Wildcard changes selection but preserves calibrated team balance
After the one-seat exchange, the system MUST apply the existing calibrated Rating team-split search and 25-point balance-equivalence tolerance to the resulting playing set. The wildcard MUST NOT randomize all teams, select a whole playing set without the normal baseline, or change Rating values.

#### Scenario: Wildcard selects the playing set
- **WHEN** a wildcard exchange produces the final playing set
- **THEN** the teams are chosen by the same Rating-sum balance and tolerance rules used for an equivalent manually selected set

#### Scenario: An imbalanced random split exists
- **WHEN** a random team split would be outside the existing balance-equivalence tolerance
- **THEN** the system does not select it merely because the playing set came from a wildcard

### Requirement: Only an exact preserved one-seat exchange starts shared cooldown
A wildcard proposal MUST carry its canonical normal playing set, exchange-in participant, and exchange-out participant into live state. A completed match SHALL count as a wildcard match only when the final actual playing set is exactly equal to `normal playing set − exchange-out + exchange-in`. Team-only manual changes MUST preserve wildcard identity because they do not change that set. Any additional playing-seat change, restoring the exchange-out participant, removing the exchange-in participant, cancelling the proposal, cancelling the live match, or leaving it incomplete MUST clear wildcard identity and prevent cooldown from starting. The same equality MUST be revalidated after manual adjustment, after reload into live state, and before completion.

#### Scenario: Wildcard exchange is completed unchanged
- **WHEN** the exchange-in player completes the match and the exchange-out player remains outside the playing set
- **THEN** the completed match is recorded as a wildcard match and shared cooldown starts at two subsequent completed matches

#### Scenario: Teams are manually rearranged
- **WHEN** the same wildcard playing set completes after players are exchanged only between team A and team B
- **THEN** wildcard identity is retained and cooldown starts

#### Scenario: Exchange-in player is manually removed
- **WHEN** manual adjustment removes the exchange-in player before match start
- **THEN** the proposal loses wildcard identity and completion does not start wildcard cooldown

#### Scenario: Exchange-out player is manually restored
- **WHEN** manual adjustment returns the exchange-out player to the playing set before match start
- **THEN** the proposal loses wildcard identity and completion does not start wildcard cooldown

#### Scenario: A third playing seat is manually changed
- **WHEN** the wildcard changed `A,B,C,D` to `A,B,C,E` and manual adjustment then changes the playing set to `A,B,F,E`
- **THEN** the final set no longer equals the original one-seat substitution, wildcard identity is cleared immediately, and completion does not start cooldown

#### Scenario: Invalid lineage survives in persisted live data
- **WHEN** reload or completion validation finds that live teams no longer equal the canonical normal set minus exchange-out plus exchange-in
- **THEN** the match MUST NOT be represented or completed as a wildcard match and MUST NOT start cooldown

#### Scenario: Pure manual override changes the normal lineup
- **WHEN** no wildcard was applied and the user manually changes any number of playing seats
- **THEN** the completed match is not recorded as a wildcard match and does not start wildcard cooldown

#### Scenario: Wildcard live match is cancelled
- **WHEN** a live match with valid wildcard identity is cancelled without a completed match record
- **THEN** no wildcard cooldown starts

### Requirement: Cooldown is session-scoped, shared, forward-only, and persistent
Completing a valid wildcard match MUST set one active-session cooldown to two. Each subsequent completed match, singles or doubles and including a forced unrated match, MUST reduce active cooldown by one. Proposals, regenerations, cancelled matches, and incomplete matches MUST NOT reduce it. The first proposal generated after the second subsequent completed match SHALL again be eligible if its normal lineup repeats the playing set from two matches earlier. Score edits and completed-match deletions MUST NOT retroactively change cooldown. Ending a session MUST prevent remaining cooldown from affecting a new session.

#### Scenario: Two normal matches follow a wildcard match
- **WHEN** two subsequent matches complete after a wildcard match
- **THEN** cooldown changes from two to one and then to zero, and the next eligible generation may draw

#### Scenario: Modes change during cooldown
- **WHEN** a doubles wildcard match is followed by a completed singles match
- **THEN** the shared cooldown decreases by one

#### Scenario: Forced unrated match completes during cooldown
- **WHEN** a structurally valid match is force-recorded without Rating while cooldown is active
- **THEN** cooldown decreases by one

#### Scenario: Match history is edited or deleted
- **WHEN** a completed score is edited or a completed match is later deleted
- **THEN** the current forward-only cooldown does not rewind, increase, or reopen retroactively

#### Scenario: App reloads during cooldown
- **WHEN** an active session with remaining cooldown is persisted and reloaded
- **THEN** the same remaining cooldown is restored

#### Scenario: New session begins
- **WHEN** a prior session ends with remaining cooldown and a new session starts
- **THEN** the new session starts with zero cooldown

### Requirement: Fairness degradation suspends wildcard behavior and cooldown progress
While authoritative fairness state is degraded, the system MUST disable wildcard draws and MUST NOT decrement existing wildcard cooldown. The active UI MUST state that the wildcard is paused because fairness data requires repair. After successful fairness repair, the prior remaining cooldown MUST resume rather than reset.

#### Scenario: Degradation begins with no cooldown
- **WHEN** fairness event replay becomes invalid while wildcard cooldown is zero
- **THEN** normal fallback proposals use total-count fairness without wildcard draws

#### Scenario: Degradation begins during cooldown
- **WHEN** fairness event replay becomes invalid while one cooldown match remains
- **THEN** completed degraded-mode matches do not consume that remaining cooldown

#### Scenario: Existing wildcard live match completes after degradation begins
- **WHEN** a live match already carried valid wildcard lineage before fairness entered degraded mode and the same exchange completes during degradation
- **THEN** the completed match retains its wildcard evidence, cooldown becomes two, and that countdown remains paused until repair

#### Scenario: Fairness is repaired
- **WHEN** the user establishes a valid recovery boundary after degradation
- **THEN** wildcard eligibility resumes with the same remaining cooldown that existed before degradation

### Requirement: Wildcard state is visible only in proposal preview and remains auditable in data
The proposal preview MUST display the exchange-in and exchange-out participants for an active wildcard. Live match, completed-match history, active-session status, and CSV restore UI MUST NOT display wildcard labels, exchange evidence, cooldown counts, or wildcard-specific degradation notices. Wildcard lineage and cooldown MUST remain persisted and auditable for behavior, storage, export, and verification. Manual adjustment that invalidates the exchange MUST immediately remove the preview marker and its future cooldown effect.

#### Scenario: Wildcard appears in preview
- **WHEN** an eligible draw applies a one-seat exchange
- **THEN** preview identifies the exchange-in and exchange-out participants

#### Scenario: Wildcard match starts and completes
- **WHEN** valid wildcard identity survives match start and completion
- **THEN** lineage remains persisted for cooldown and audit behavior, but live UI and later history do not expose wildcard status or exchange evidence

#### Scenario: Cooldown is active
- **WHEN** one or two cooldown matches remain
- **THEN** proposal generation enforces the exact remaining count without displaying it in active-session or CSV restore UI

#### Scenario: Manual adjustment invalidates the exchange
- **WHEN** a user restores the exchange-out participant or removes the exchange-in participant
- **THEN** the preview immediately removes wildcard and exchange evidence, and subsequent persisted state has no wildcard claim

### Requirement: Completed matches have stable session-local rotation chronology
Every completed match MUST carry a positive session-local `completionSequence`, and its session MUST carry the next strictly greater sequence as a persisted high-water mark. A new completion MUST consume the current high-water value and then advance it, so deletion cannot cause reuse. Rotation wildcard `t`/`t-2` lookup, consecutive-play counts, and simulation comparisons MUST order completed matches by this sequence rather than relying on timestamp or in-memory/CSV row order. Score edits MUST preserve the sequence; deletion MUST leave a gap that is not reused. `completionSequence` and its high-water mark MUST NOT change the existing Glicko replay event ordering or become Rating authority.

#### Scenario: Two matches share one timestamp
- **WHEN** two completed matches in the same session have equal `at` timestamps
- **THEN** their distinct completion sequences determine one stable rotation order across reload and CSV round-trip

#### Scenario: Completion high-water cannot be advanced safely
- **WHEN** a persisted completion sequence or next high-water is not a positive safe integer strictly below `Number.MAX_SAFE_INTEGER`, or allocating it would make the next high-water invalid
- **THEN** normalization／allocation fails before mutating the session and never emits a duplicate or reused completion sequence

#### Scenario: Completed match is edited or deleted
- **WHEN** a completed match is score-edited or deleted
- **THEN** edits preserve its sequence, deletion does not renumber later matches, and the next completed match uses a sequence above the prior session maximum

#### Scenario: Legacy matches lack completion sequence
- **WHEN** legacy matches in a session have no completion sequence
- **THEN** one migration orders them by ascending `at` and then original persisted match-array or CSV-row order for ties, assigns `1..N`, sets the session high-water mark to `N+1`, and persists those values without changing matches, Rating, or replay boundaries

#### Scenario: Present completion sequence is invalid
- **WHEN** a session contains a non-positive, non-integer, or duplicate present completion sequence, or a non-integer high-water mark not greater than every retained sequence
- **THEN** recovery is blocked rather than silently reordering, renumbering, or reusing non-legacy data

#### Scenario: Rating history replays
- **WHEN** Rating is calculated or replayed for matches carrying completion sequence
- **THEN** existing Rating event chronology remains authoritative and does not read completion sequence

### Requirement: Wildcard metadata survives storage and CSV without fabricated legacy state
Active-session cooldown, valid live wildcard lineage, and completed wildcard exchange metadata MUST survive local persistence, app reload, and CSV export/import. Legacy records that lack these fields MUST remain valid and MUST be interpreted as non-wildcard records. An active legacy session upgraded to this capability MUST start with zero cooldown. The system MUST NOT infer wildcard state from historical lineup differences. Present wildcard data MUST be validated strictly: unknown schema versions, malformed or duplicate IDs, mode-incompatible normal-set sizes, invalid exchange-in/out membership, impossible one-seat set equality, and non-integer or out-of-range cooldown MUST enter the existing blocked recovery path rather than being silently dropped or treated as legacy absence.

#### Scenario: Local persistence round-trip
- **WHEN** active cooldown or recoverable live wildcard state is saved and reloaded
- **THEN** the same cooldown and exchange lineage are restored

#### Scenario: CSV round-trip
- **WHEN** sessions and completed wildcard matches are exported and imported
- **THEN** cooldown-relevant active state and completed exchange evidence are preserved exactly

#### Scenario: Legacy active session is upgraded
- **WHEN** an active session without wildcard fields is first loaded
- **THEN** its matches and fairness state are unchanged and wildcard cooldown is initialized to zero

#### Scenario: Legacy history contains an unusual lineup
- **WHEN** a historical match differs from what the current algorithm would propose but has no wildcard metadata
- **THEN** it remains an ordinary historical match and no wildcard is inferred

#### Scenario: Present wildcard metadata is malformed
- **WHEN** persisted or imported wildcard data has an unknown version, duplicate or invalid identity, wrong normal-set size, invalid exchange membership, impossible final one-seat equality, or cooldown outside integer `0..2`
- **THEN** recovery is blocked with the raw data preserved, and the system MUST NOT silently erase the field or reinterpret it as legacy absence

### Requirement: CSV import restores one complete operational checkpoint
CSV import MUST retain the existing full overwrite-restore semantics. Importing a valid older backup MUST restore the active session's wildcard cooldown, completion sequences, and sequence high-water mark exactly as they were at export time rather than merging them with or preserving newer local operational state. Before replacement, the confirmation UI MUST explicitly state that active-session wildcard cooldown and completion order will return to the backup checkpoint, display the backup's active-session cooldown when present, and continue to offer export of current data as a recovery point. Malformed present fields MUST fail closed before any partial replacement.

#### Scenario: Older backup has lower cooldown
- **WHEN** current local state has wildcard cooldown two and the user confirms a valid older backup whose active session has cooldown zero
- **THEN** the complete import replaces local data and the restored cooldown is zero

#### Scenario: User reviews import confirmation
- **WHEN** a selected backup contains an active session
- **THEN** the confirmation explains full checkpoint replacement, identifies the backup cooldown, warns that completion order and current operational state will be overwritten, and offers current-data export

#### Scenario: Backup operational state is malformed
- **WHEN** cooldown, completion sequence, high-water mark, or wildcard lineage in the selected backup is invalid
- **THEN** import fails before replacing any local record and preserves the current local data unchanged

### Requirement: Rating and replay authority are unchanged
Rotation wildcard state MUST NOT change Glicko inputs, Rating values, scoring-format snapshots, activity opening snapshots, historical Rating replay boundaries, or fairness-period lineage. A completed wildcard match MUST affect appearances and Rating exactly as the same final lineup created by unrestricted manual adjustment would.

#### Scenario: Equivalent final lineups are recorded
- **WHEN** one match originated from a wildcard and another equivalent match originated from manual adjustment with identical final teams and score
- **THEN** both produce identical appearance attribution, Glicko updates, and Rating replay results

#### Scenario: Wildcard metadata is edited or unavailable
- **WHEN** wildcard display metadata is absent from a legacy record or read during Rating replay
- **THEN** Rating replay depends only on the actual stored match teams, score, scoring format, and existing authoritative boundaries

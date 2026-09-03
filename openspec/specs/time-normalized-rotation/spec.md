# time-normalized-rotation Specification

## Purpose
Defines auditable time-normalized rotation fairness for active badminton sessions, including eligible-presence timing, fairness periods, rate calculation, persistence, migration, recovery, and user-visible behavior.
## Requirements
### Requirement: Eligible presence time is derived from authoritative events
The system MUST derive each participant's eligible presence time from ordered, persisted attendance events. Time MUST accumulate only while the participant is present and not on voluntary rest within an active session. Leaving or starting voluntary rest MUST pause accumulation; rejoining or ending voluntary rest MUST resume the same fairness period. App backgrounding, locking, closing, reloading, or wall-clock time passing MUST NOT pause an otherwise active interval.

#### Scenario: Participant remains eligible while the app is closed
- **WHEN** a present non-resting participant's app is closed and later reopened while the session remains active
- **THEN** the elapsed wall-clock interval is included in eligible presence time

#### Scenario: Voluntary rest pauses time
- **WHEN** a participant starts voluntary rest and later ends it
- **THEN** the interval between those events is excluded from eligible presence time

#### Scenario: Leaving and rejoining preserves the fairness period
- **WHEN** a participant leaves and later rejoins the same session without a fairness reset
- **THEN** the absent interval is excluded and the prior fairness period resumes with its previous appearances and eligible time intact

#### Scenario: Timestamp zero is valid
- **WHEN** a valid event has timestamp `0`
- **THEN** the event is treated as present and ordered normally rather than as missing

#### Scenario: Equal timestamps are replayed deterministically
- **WHEN** two valid events in the same session have the same timestamp
- **THEN** replay uses their persisted stable event order and produces the same state after reload and CSV round-trip

### Requirement: Play rate uses the current fairness period
For matchmaking, the system MUST calculate a participant's play rate as completed appearances attributed to the participant's current fairness period divided by eligible presence hours accumulated in that period. A newly started period with zero eligible duration MUST participate as the lowest current rate. Singles and doubles appearances MUST share the same period and each completed appearance MUST count as one.

#### Scenario: Late participant starts without historical catch-up
- **WHEN** a participant joins after a session has already produced completed matches
- **THEN** their fairness period begins at joining with zero appearances and no time or appearance debt from before joining

#### Scenario: New participant enters the next ordering
- **WHEN** a newly joined eligible participant has zero eligible duration at proposal time
- **THEN** the participant is treated as having the lowest rate and immediately participates in the next matchmaking ordering

#### Scenario: Singles and doubles share the rate
- **WHEN** a participant completes one singles match and one doubles match in the same fairness period
- **THEN** the period contains two completed appearances

#### Scenario: Forced unrated match still counts
- **WHEN** a completed match is force-recorded but excluded from Rating
- **THEN** each actual participant receives one appearance in the applicable fairness period

#### Scenario: Cancelled or incomplete match does not count
- **WHEN** a proposal or live match is cancelled without a completed match record
- **THEN** no participant receives an appearance

#### Scenario: Manual teams determine actual appearances
- **WHEN** users exchange players between teams and the rest list before starting a match
- **THEN** only the final players who complete the recorded match receive an appearance

### Requirement: Match appearances have stable fairness-period lineage
The system MUST freeze each actual player's fairness-period identity when a match starts. Completing, editing, replaying, or deleting records MUST use that frozen lineage rather than the player's later current period. Deleting a match MUST remove its appearances from the attributed periods without changing attendance events or Rating replay boundaries.

#### Scenario: Match completes after a fairness reset was requested
- **WHEN** a player requests a reset during a live match and that match completes
- **THEN** the completed appearance remains attributed to the period active when the match started and the queued new period starts only after completion

#### Scenario: Live match is cancelled after a reset request
- **WHEN** a player requests a reset during a live match and the live match is then cancelled
- **THEN** no appearance is recorded and the queued new period begins at cancellation

#### Scenario: Completed match is deleted
- **WHEN** a completed match is deleted from an active or ended session
- **THEN** its attributed appearances are removed, play rates are recomputed from the remaining matches, attendance timing is unchanged, and no later session is affected

#### Scenario: Score-only edit preserves appearances
- **WHEN** only the score of a completed match is edited
- **THEN** its fairness-period lineage and appearance counts remain unchanged

### Requirement: Users can restart a participant fairness period without rewriting history
The system SHALL provide a per-participant secondary action in the active-session participant interface to reset play rate. The action MUST require confirmation and MUST create a new fairness period without changing completed matches, daily appearance totals, session participation, Rating state, or Rating replay. A reset for a player in a live match MUST be queued until that match completes or is cancelled; otherwise it MUST take effect immediately. The live-match overlay MUST NOT expose a post-match reset menu or per-participant fairness-reset controls.

#### Scenario: Idle participant is reset
- **WHEN** the user confirms a reset for a participant who is not in a live match
- **THEN** a new fairness period begins immediately with zero appearances and zero eligible time

#### Scenario: Playing participant is reset
- **WHEN** the user opens the active-session participant controls and confirms a reset for a participant in the live match
- **THEN** the UI indicates a pending reset and the old period remains active until that match completes or is cancelled

#### Scenario: Live-match overlay omits reset controls
- **WHEN** a live match is displayed
- **THEN** the overlay shows no post-match reset menu and no per-participant fairness-reset control

#### Scenario: Reset does not alter history or Rating
- **WHEN** a fairness period reset takes effect
- **THEN** the participant's completed matches, daily total, Rating, RD, volatility, activity summary, and Rating replay results remain unchanged

### Requirement: Eligibility changes invalidate only unstarted proposals
Joining, leaving, starting voluntary rest, ending voluntary rest, or an immediately effective fairness reset MUST cancel an existing unstarted proposal and require generation of a new one. Wall-clock time passing alone MUST NOT invalidate or silently replace a proposal. A proposal's fairness decision MUST remain frozen from proposal generation through manual adjustment and match start.

#### Scenario: Participant joins during preview
- **WHEN** a participant joins while an unstarted proposal exists
- **THEN** the proposal is cancelled and the next proposal uses the new eligibility state

#### Scenario: Voluntary rest changes during preview
- **WHEN** any participant starts or ends voluntary rest while an unstarted proposal exists
- **THEN** the proposal is cancelled

#### Scenario: Preview waits without state changes
- **WHEN** an unstarted proposal remains open while play rates change only through elapsed time
- **THEN** the proposal remains available and is not recomputed at match start

#### Scenario: Manual override is unrestricted
- **WHEN** the user exchanges a higher-rate resting participant with a lower-rate playing participant
- **THEN** the system permits the exchange without a fairness warning and uses the resulting actual lineup

### Requirement: Active-session UI explains the operational fairness state
The active participant list MUST display each participant's current play rate rounded to two decimal places in appearances per hour and their daily completed appearance total. Displayed rates MUST refresh at least once per minute and immediately after relevant attendance, fairness-reset, or match-completion events, while matchmaking MUST use the precise rate at proposal time. The first version MUST NOT expose the 0.5 appearances-per-hour band as a user setting and MUST NOT add play-rate output to ended-session history UI.

#### Scenario: Rate display rounds without changing selection
- **WHEN** two precise rates round to the same two-decimal display value but belong to different fairness layers
- **THEN** the UI may display the same value while matchmaking continues to use the precise rates

#### Scenario: Daily total survives a reset
- **WHEN** a participant with completed appearances resets their fairness period
- **THEN** the displayed rate restarts from the new period while the displayed daily total remains unchanged

#### Scenario: Ended session history remains unchanged
- **WHEN** a session ends
- **THEN** its timing data remains persisted and exportable but no new play-rate summary is added to the history UI

### Requirement: Time-normalized fairness data survives persistence and export
Attendance events, stable event order, fairness periods, pending reset state when applicable, and match-to-period lineage MUST survive local persistence, app reload, and CSV export/import without changing derived rates. Exported data MUST retain ended-session event history even though the first version does not display it.

#### Scenario: Local persistence round-trip
- **WHEN** valid fairness data is saved and reloaded at the same evaluation time
- **THEN** the reconstructed eligibility state, period lineage, appearances, eligible durations, and rates are identical

#### Scenario: CSV round-trip
- **WHEN** valid fairness data is exported and imported
- **THEN** all authoritative events and match lineage are preserved and derive the same state at the same evaluation time

#### Scenario: Pending reset survives reload
- **WHEN** a playing participant has a queued reset and the app reloads with recoverable live context
- **THEN** the reset remains queued against that live match and does not take effect early

### Requirement: Legacy data migration does not fabricate attendance history
When upgrading an active legacy session that lacks authoritative timing events, the system MUST start a new fairness period at migration time for every currently present participant. Existing matches, daily totals, attendance membership, Rating state, and Rating replay MUST remain unchanged. The system MUST NOT infer join times from session start, first match time, participant order, or player creation time. Ended legacy sessions MUST NOT receive fabricated attendance events.

#### Scenario: Active legacy session is upgraded
- **WHEN** an active legacy session with present participants is first loaded by the new version
- **THEN** each currently present participant receives a new period beginning at migration time with zero period appearances and zero eligible time

#### Scenario: Ended legacy session is upgraded
- **WHEN** an ended legacy session has no timing events
- **THEN** its existing records are preserved without synthesized attendance events or play-rate history

#### Scenario: Legacy migration preserves Rating authority
- **WHEN** legacy fairness data is migrated
- **THEN** no Rating snapshot, match result, baseline, override, scoring-format snapshot, or replay boundary changes

### Requirement: Invalid event history degrades visibly and can be repaired
If authoritative timing events or match-period lineage cannot be replayed reliably, the system MUST visibly enter fairness-degraded mode and use the existing session-total-play-count and consecutive-play ordering for proposals. A persistent warning MUST state that play-rate fairness is not active. The system MUST preserve raw export, MUST NOT silently discard or rewrite invalid history, and MUST NOT represent fallback-period activity as reliable play-rate history. It SHALL provide a repair action that starts new fairness periods for all currently present participants and restores time-normalized fairness from that new boundary.

#### Scenario: Invalid event transition is loaded
- **WHEN** an event sequence contains an impossible transition or unknown lineage reference
- **THEN** proposals use total-play-count fairness and the active UI shows a persistent degradation warning

#### Scenario: Matches complete during degradation
- **WHEN** a match is completed while fairness-degraded mode is active
- **THEN** the match, daily totals, and Rating update normally but no reliable play-rate lineage is fabricated for the degraded interval

#### Scenario: User exports before repair
- **WHEN** fairness-degraded mode is active and the user exports data
- **THEN** the original invalid data and degradation-relevant records remain available for recovery or diagnosis

#### Scenario: User repairs the active session
- **WHEN** the user confirms the all-present-participants repair action while no live-match boundary prevents it
- **THEN** new fairness periods begin from one explicit recovery boundary and subsequent proposals use time-normalized fairness


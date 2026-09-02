## ADDED Requirements

### Requirement: Fairness-band changes are gated by deterministic simulation evidence
Before replacing the current fixed 0.5 appearances-per-hour fairness band in production, the project MUST evaluate the candidate bands `0`, `0.25`, `0.5`, `0.75`, `1`, `1.5`, `2`, `3`, `4`, `6`, and `8` appearances per hour with deterministic seeded simulations. The evaluation MUST compare current-band/no-wildcard, candidate-band/no-wildcard, current-band/wildcard, and candidate-band/wildcard variants separately. It MUST cover doubles with 4 through 16 eligible participants and singles with 2 through 10, variable attendance and match duration, mixed modes, voluntary rest, and equal, continuous, and extreme Rating distributions. Offline simulation MUST NOT become production matchmaking authority.

#### Scenario: Candidate band is evaluated
- **WHEN** a fixed fairness-band candidate is considered for production
- **THEN** the report contains separate A/B/C/D results across every required participant-count, attendance, duration, mode, and Rating scenario

#### Scenario: Simulation is repeated with the same seed set
- **WHEN** the same candidate, scenario matrix, and seed set are evaluated again
- **THEN** every generated event sequence, proposal result, and aggregate metric is identical

#### Scenario: Simulation code runs offline
- **WHEN** the production PWA builds and runs
- **THEN** no offline simulation runtime, Python authority, report fixture, or candidate-selection logic is required by production matchmaking

### Requirement: A candidate band must pass effect and fairness gates
The primary effect metric MUST be the rate at which the actual completed playing set at chronological opportunity `t` exactly repeats the actual completed playing set at `t - 2`; the normal-proposal-versus-actual comparison is trigger-fidelity diagnostic evidence only and MUST NOT replace the primary metric. The promotion denominator MUST include only individual opportunities with `t >= 2` where the final eligibility snapshot contains at least one present, non-voluntary-rest participant outside the normal playing set. No-replacement-capacity opportunities MUST be counted and reported as controls but excluded from the promotion denominator. A simulation cell MUST be the complete mode, participant-count, attendance-family, match-duration-family, and Rating-profile identity. Every promotion cell MUST use the same fixed set of at least 500 seeds and exact A/B/C/D `(cell, seed)` counterparts; missing, duplicate, or surplus identities MUST fail closed. The effect aggregate MUST first average eligible-opportunity repeat indicators within each `(cell, seed, method)`, then average seeds within each cell, then give every cell with at least one eligible opportunity equal weight. Candidate D MUST reduce that equal-cell mean by at least 25 percent relative to baseline A. A cell whose baseline repeat rate is zero MUST remain in absolute aggregates and disclosure but MUST NOT be divided for a cell-relative percentage. For each cell separately, the paired D-minus-A worst-participant cumulative appearance shortfall and longest consecutive non-voluntary-rest increase MUST each have a 95th percentile no greater than one completed appearance or match. The percentile MUST use conservative nearest-rank `sorted[ceil(0.95 × N) − 1]` without interpolation. Every cell MUST pass both fairness gates; a pooled or opportunity-weighted result MUST be reported only as sensitivity evidence and MUST NOT override a failed cell. Reports MUST disclose each cell, the 99th percentile, and worst observed cases.

#### Scenario: Primary effect uses actual completed lineups
- **WHEN** a wildcard changes a normal proposal that would have repeated the playing set from two matches earlier and the resulting match completes
- **THEN** the primary effect row compares that completed actual playing set with the actual playing set at `t - 2`, while the unchanged normal baseline is retained only as trigger-fidelity evidence

#### Scenario: Replacement capacity changes within a scenario
- **WHEN** attendance or voluntary rest leaves no eligible participant outside the normal playing set for some rounds but provides an outside participant for other rounds
- **THEN** only the latter individual opportunities enter the promotion denominator, and both opportunity counts are reported

#### Scenario: Candidate meets both gates
- **WHEN** candidate D reduces the equal-cell mean actual repeat rate by at least 25 percent relative to A and every individual cell's nearest-rank p95 paired appearance-shortfall and non-voluntary-rest increases are each no greater than one
- **THEN** it may be recommended for explicit product approval

#### Scenario: Candidate improves repetition but one cell fails fairness
- **WHEN** a candidate reduces the equal-cell repeat aggregate but any cell's nearest-rank p95 appearance shortfall or non-voluntary-rest increase exceeds one
- **THEN** it is rejected regardless of pooled or opportunity-weighted sensitivity results

#### Scenario: Paired identities are incomplete
- **WHEN** any promotion cell has fewer than 500 seeds or any `(cell, seed)` lacks exactly one A, B, C, and D record
- **THEN** the evaluation fails closed before aggregate metrics or a recommendation are published

#### Scenario: No candidate passes
- **WHEN** every candidate fails either the effect gate or a fairness gate
- **THEN** the report states that no production fairness-band change is authorized and does not select the least-bad value

#### Scenario: Aggregate result hides a participant-count regression
- **WHEN** the overall mean passes but one participant-count or attendance slice regresses
- **THEN** the report exposes that slice for product review before approval

### Requirement: Production uses one explicitly approved fixed fairness band
After simulation, production MUST continue to use one fixed, minimum-anchored, inclusive fairness band for every participant count and both match modes. The selected numeric value MUST come from one version-controlled approval manifest that binds the exact report and summary SHA-256 digests, selected candidate, explicit human approver, and approval source. A build/release guard MUST recompute those digests and fail unless the production constant equals the approved candidate. When no complete valid approval manifest exists, the same guard MUST require the production constant to remain exactly 0.5 appearances per hour. The system MUST NOT derive the band from participant count, expose it as a user setting, silently choose the numerically best simulation result, or permit an invalid or stale approval manifest to authorize a build.

#### Scenario: Approved band enters production
- **WHEN** a complete version-controlled approval manifest names a candidate, binds valid report and summary digests, records explicit human approval, and the production constant equals that candidate
- **THEN** the build/release guard passes and every normal singles and doubles proposal uses that same fixed inclusive value

#### Scenario: No approval exists
- **WHEN** simulation is complete but no complete valid approval manifest exists
- **THEN** the build/release guard passes only when production retains exactly 0.5 appearances per hour

#### Scenario: Approval or evidence is tampered
- **WHEN** the production constant, selected candidate, report bytes, summary bytes, digest, approver, or approval source does not match the complete approval manifest
- **THEN** the build/release guard fails closed before production publication

#### Scenario: Participant count changes
- **WHEN** eligible attendance changes during a session
- **THEN** the fixed band value remains unchanged

#### Scenario: User opens settings
- **WHEN** the product is running with the approved band
- **THEN** no fairness-band control is exposed

### Requirement: Fairness degradation suspends rotation wildcard authority
When authoritative timing events or match-period lineage cannot be replayed reliably, normal proposals MUST continue to use the existing session-total-play-count and consecutive-play fallback. Rotation-wildcard draws MUST be disabled and active rotation-wildcard cooldown MUST stop decreasing until a valid repair boundary restores time-normalized fairness. The system MUST preserve the pre-degradation cooldown value and MUST visibly explain that the wildcard is paused.

#### Scenario: Degraded match completes during active cooldown
- **WHEN** a match completes while fairness is degraded and one wildcard cooldown match remains
- **THEN** total-count fallback statistics update normally but the wildcard cooldown remains one

#### Scenario: Fairness repair succeeds
- **WHEN** the user establishes a new valid fairness boundary
- **THEN** time-normalized proposals and wildcard eligibility resume using the preserved cooldown value

#### Scenario: Repair and completion share one wall-clock millisecond
- **WHEN** an applied recovery boundary follows an already-completed match at the same wall-clock millisecond and a later match completes without the wall clock advancing
- **THEN** persisted timing preserves the causal order `completed prefix < applied boundary/period events ≤ later completion`, the repaired suffix remains valid, and cooldown can resume without changing `completionSequence` or Rating replay authority

#### Scenario: Persisted attendance event is in the future
- **WHEN** an existing attendance event is later than the trusted wall-clock/runtime evaluation time
- **THEN** ordinary attendance changes, proposals, match start, and completion remain fairness-degraded and MUST NOT advance trusted time to that persisted value; only an explicit applied recovery boundary may supersede the corrupt timeline and establish a new authoritative suffix

#### Scenario: Wall clock moves backward during a live match
- **WHEN** a match starts at a trusted causal time and the wall clock moves backward before score submission
- **THEN** the completed match timestamp is not earlier than its persisted live `startedAt`, while `completionSequence` remains the rotation-order authority

#### Scenario: Wall clock moves backward before session end
- **WHEN** a trusted completed match exists and the wall clock moves backward before the session ends
- **THEN** `endedAt` uses the trusted causal runtime and is not earlier than session start or that completed match; a persisted future match beyond trusted time causes ending to fail closed rather than silently advancing authority, and Rating replay includes matches only within `[startedAt, endedAt]`

#### Scenario: Timestamp cannot be safely incremented
- **WHEN** persisted session, live, attendance, or match timing is negative, fractional, non-finite, or greater than or equal to `Number.MAX_SAFE_INTEGER`, or a new session／migration／runtime authority timestamp cannot produce one further valid strict successor
- **THEN** localStorage／CSV normalization or the initiating operation rejects the value before mutation instead of allowing recovery or ordinary operations to claim a strictly later timestamp

#### Scenario: Degradation has no active cooldown
- **WHEN** fairness is degraded with zero wildcard cooldown
- **THEN** proposals use total-count fallback without any wildcard draw

## MODIFIED Requirements

### Requirement: Active-session UI explains the operational fairness state
The active participant list MUST display each participant's current play rate rounded to two decimal places in appearances per hour and their daily completed appearance total. Displayed rates MUST refresh at least once per minute and immediately after relevant attendance, fairness-reset, or match-completion events, while matchmaking MUST use the precise rate at proposal time. The first version MUST NOT expose the approved fixed appearances-per-hour band as a user setting and MUST NOT add play-rate output to ended-session history UI. Rotation wildcard cooldown and fairness-degradation state MUST remain behavioral inputs but MUST NOT appear as active-session warnings, counters, or repair prompts.

#### Scenario: Rate display rounds without changing selection
- **WHEN** two precise rates round to the same two-decimal display value but belong to different fairness layers
- **THEN** the UI may display the same value while matchmaking continues to use the precise rates

#### Scenario: Daily total survives a reset
- **WHEN** a participant with completed appearances resets their fairness period
- **THEN** the displayed rate restarts from the new period while the displayed daily total remains unchanged

#### Scenario: Ended session history remains unchanged
- **WHEN** a session ends
- **THEN** its timing data remains persisted and exportable but no new play-rate summary is added to the history UI

#### Scenario: Fixed band is not configurable
- **WHEN** a user views active-session or application settings
- **THEN** no control exposes or changes the approved fixed fairness band

#### Scenario: Wildcard cooldown is active
- **WHEN** one or two wildcard cooldown matches remain
- **THEN** matchmaking enforces the remaining count without displaying a wildcard cooldown counter

#### Scenario: Fairness degradation pauses wildcard
- **WHEN** fairness-degraded mode is active
- **THEN** matchmaking uses total-count fallback and pauses wildcard behavior without displaying a degradation warning or repair prompt

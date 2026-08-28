# Performance Score Rating

## ADDED Requirements

### Requirement: A known format derives the observed score from the final score

When a match carries a structured scoring format, the score observed by the rating update MUST be the win probability implied by the observed rally rate, computed as the proportion of rallies won and converted through the endpoint distribution of that format. The two teams' observed scores MUST sum to one.

#### Scenario: A close win
- **WHEN** a match under a known format is won narrowly
- **THEN** the winner's observed score is above one half but well below one, and the loser's is its complement

#### Scenario: A dominant win
- **WHEN** a match under a known format is won by a wide margin
- **THEN** the winner's observed score approaches one

#### Scenario: A shutout
- **WHEN** the losing team scores no points
- **THEN** the winner's observed score is one and the loser's is zero, matching the previous behaviour

#### Scenario: Two matches with the same winner but different margins
- **WHEN** two otherwise identical matches under the same known format differ only in margin
- **THEN** the resulting ratings differ, and the wider margin moves the winner further

### Requirement: An unknown format keeps the binary outcome

When a match's format is unknown, whether explicit or legacy, the observed score MUST remain one for the winner and zero for the loser. The product MUST NOT assume a format, a default, or a catalog entry in order to derive a performance score.

#### Scenario: Legacy match is rated
- **WHEN** a match with a `legacy-missing` format is rated or replayed
- **THEN** the observed score is the binary outcome and the resulting rating is identical to the previous behaviour

#### Scenario: Existing history is unchanged by this capability
- **WHEN** stored history contains only matches without a known format
- **THEN** every player's rating, RD, and volatility after replay are identical to what the previous implementation produced

#### Scenario: Mixed history
- **WHEN** history contains both known-format and unknown-format matches
- **THEN** each match is rated by its own format's rule and replay applies them in the existing chronological order

### Requirement: Rating mechanics other than the observed score are unchanged

The Glicko-2 update equations, tau, rating deviation, volatility, initial ratings, the doubles virtual-opponent construction, session opening snapshots, and replay boundaries MUST be unchanged. Matches excluded from rating MUST continue to be skipped entirely.

#### Scenario: Single-player update is unaffected
- **WHEN** the update is computed for an explicit observed score
- **THEN** the result matches the published Glicko-2 worked example, as before

#### Scenario: Unrated match is skipped
- **WHEN** a match is marked excluded from rating
- **THEN** no observed score is derived and no rating changes, whatever its format

#### Scenario: Replay boundary is preserved
- **WHEN** a completed match's score is edited
- **THEN** replay still starts from the session's fixed opening snapshot and still does not cross into the next session

### Requirement: The conversion is pure, deterministic, and independent of calibration

The conversion MUST depend only on the stored scores and the match's frozen format. It MUST NOT read the calibration coefficient used for display, matchmaking state, wall-clock time, or any random source, and repeated replays of identical data MUST produce identical ratings.

#### Scenario: Replay is reproducible
- **WHEN** identical history is replayed more than once
- **THEN** the resulting ratings are bit-identical

#### Scenario: Matchmaking stays independent
- **WHEN** the matchmaking module is inspected
- **THEN** it imports neither this capability's module nor the scoring-format module

#### Scenario: Calibration changes
- **WHEN** the display calibration coefficient is refitted to another value
- **THEN** no rating changes, because the conversion does not read it


## MODIFIED Requirements

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

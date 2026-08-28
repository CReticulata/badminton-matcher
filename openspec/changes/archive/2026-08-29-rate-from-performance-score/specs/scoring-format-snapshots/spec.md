# Scoring Format Snapshots

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

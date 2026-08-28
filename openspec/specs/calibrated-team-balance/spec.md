# calibrated-team-balance Specification

## Purpose
TBD - created by archiving change balance-teams-within-fairness-ties. Update Purpose after archive.
## Requirements
### Requirement: Fairness keeps absolute priority over balance

Balance MUST only decide among candidates that the fairness rules have already declared equivalent. A candidate with a strictly better fairness position — fewer plays in the session, or the same plays and fewer consecutive plays — MUST be selected before any candidate with a worse position, regardless of the resulting team gap. Voluntary rest MUST continue to remove a candidate from selection entirely.

#### Scenario: A strictly fairer candidate is available
- **WHEN** a candidate has fewer plays than another
- **THEN** the fairer candidate is selected first, even when benching them would produce a smaller team gap

#### Scenario: Consecutive plays break a play-count tie
- **WHEN** two candidates have equal play counts and different consecutive-play counts
- **THEN** the one with fewer consecutive plays is selected first, even when the other would balance better

#### Scenario: Voluntary rest is absolute
- **WHEN** a candidate has marked voluntary rest
- **THEN** they are placed in the rest list and are never considered for balance, whatever gap results

### Requirement: The playing group and the split are chosen jointly within a tie group

Among candidates tied on every fairness key, the product MUST choose which of them play and how they are split as one decision, minimizing the absolute difference between the two teams' rating sums. Candidates outside the tie group that fairness has already admitted MUST remain in the playing group and participate in the split.

#### Scenario: Every eligible candidate is tied
- **WHEN** all eligible candidates share the same play count and consecutive-play count and more of them are present than a match needs
- **THEN** the selected group and split minimize the team rating gap over every fairly equivalent choice

#### Scenario: The tie group only partly fills the match
- **WHEN** some candidates are strictly fairer than the rest and do not fill the match by themselves
- **THEN** those candidates all play, and only the remaining places are chosen from the next tie group

#### Scenario: The tie group exactly fills the match
- **WHEN** the fairness ordering admits exactly the number of players a match needs
- **THEN** the playing group is fully determined by fairness and only the split is optimized, as before

### Requirement: Variety is preserved among equivalent options

Options whose team gap differs by no more than a defined tolerance MUST be treated as equivalent, and one MUST be chosen at random among them using the injected random source. Selection MUST NOT be a deterministic function of ratings alone.

#### Scenario: Several options balance equally well
- **WHEN** more than one fairly equivalent option lies within the tolerance of the best gap
- **THEN** the choice among them varies across runs with different random sources

#### Scenario: Repeated rounds with an unchanged roster
- **WHEN** the same tie group is proposed repeatedly with no matches recorded
- **THEN** the selected groups and pairings vary rather than repeating one arrangement

#### Scenario: A player far from the rest of the field
- **WHEN** one candidate's rating is far enough from every other that no group containing them balances well
- **THEN** they may be benched while tied, and the fairness rules still admit them unconditionally in the following round, keeping the play-count spread within one

#### Scenario: A given random source is reproducible
- **WHEN** the same candidates and the same seeded random source are supplied
- **THEN** the proposal is identical

### Requirement: The search is bounded and degrades to current behaviour

The number of enumerated options MUST be bounded by a fixed limit. When a tie group would exceed it, the product MUST fall back to the existing behaviour — fairness order, then the split search within the resulting group — rather than truncating the search silently in a way that hides which options were skipped.

#### Scenario: Tie group is within the limit
- **WHEN** enumerating the tie group stays within the bound
- **THEN** the joint search runs over every fairly equivalent option

#### Scenario: Tie group exceeds the limit
- **WHEN** the tie group is large enough to exceed the bound
- **THEN** the previous selection behaviour is used and a proposal is still produced

#### Scenario: Not enough eligible candidates
- **WHEN** fewer eligible candidates are present than the match needs
- **THEN** no proposal is produced, exactly as before

### Requirement: Rating authority and recorded history are untouched

This capability MUST NOT read, write, or influence rating state, match history, replay boundaries, scoring-format snapshots, or persistence. It MUST NOT alter what is stored for a completed match.

#### Scenario: A proposal is generated and accepted
- **WHEN** a proposal produced by the joint search is played and scored
- **THEN** the stored match, the Glicko update, and the replay behaviour are identical to what an equivalent manually arranged match would produce

#### Scenario: Calibration changes
- **WHEN** the calibrated coefficient is later refitted to a different value
- **THEN** no stored rating, match, or snapshot changes, and selection remains the same because it does not use the coefficient


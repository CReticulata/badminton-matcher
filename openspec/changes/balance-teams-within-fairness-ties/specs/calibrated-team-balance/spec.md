# Calibrated Team Balance

## ADDED Requirements

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
- **THEN** the players selected vary rather than always seating the same mid-rated group and benching the rating extremes

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

### Requirement: Expected margin is derived only from a structured format

`expectedMargin` MUST accept a rating gap and a structured scoring format and return the expected absolute point margin under the frozen endpoint model with the calibrated coefficient. It MUST NOT be defined for an unknown format, and the product MUST NOT substitute a default format to obtain a value.

#### Scenario: Structured format is available
- **WHEN** a session's format is catalog or custom
- **THEN** an expected margin is available for a given rating gap and increases as the gap increases

#### Scenario: Format is unknown
- **WHEN** a session's format is unknown, whether explicit or legacy
- **THEN** no expected margin is produced, no readout is shown, and selection behaviour is unaffected

#### Scenario: Coefficient provenance is recorded
- **WHEN** the calibrated coefficient is defined in code
- **THEN** its value, confidence interval, sample size, and source document are recorded alongside it

### Requirement: The readout must not imply unwarranted precision

Any user-facing balance figure MUST be presented as approximate. The product MUST NOT present a specific predicted final score, a win probability, or a figure with more precision than the calibration supports, and MUST NOT describe it as a prediction of the match result.

#### Scenario: A proposed match is previewed
- **WHEN** a proposal is shown for a session with a structured format
- **THEN** an explicitly approximate indication of how lopsided the match is likely to be is shown next to the manual-swap controls

#### Scenario: Manual swap changes the teams
- **WHEN** the user swaps two players in the preview
- **THEN** the indication updates for the new teams before the match starts

#### Scenario: Rating uncertainty is high
- **WHEN** one or more selected players have wide rating deviation, such as a newly added player
- **THEN** the indication does not present the figure as more reliable than for established players

### Requirement: Rating authority and recorded history are untouched

This capability MUST NOT read, write, or influence rating state, match history, replay boundaries, scoring-format snapshots, or persistence. It MUST NOT alter what is stored for a completed match.

#### Scenario: A proposal is generated and accepted
- **WHEN** a proposal produced by the joint search is played and scored
- **THEN** the stored match, the Glicko update, and the replay behaviour are identical to what an equivalent manually arranged match would produce

#### Scenario: Calibration changes
- **WHEN** the calibrated coefficient is later refitted to a different value
- **THEN** no stored rating, match, or snapshot changes, and selection remains the same because it does not use the coefficient

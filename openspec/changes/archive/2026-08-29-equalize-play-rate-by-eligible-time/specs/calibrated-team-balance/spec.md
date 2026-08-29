## REMOVED Requirements

### Requirement: Fairness keeps absolute priority over balance
**Reason**: 公平鍵由「當日上場次數」改為以可上場時間正規化的上場率層，舊需求的場景名稱直接寫死場數語意，無法在原名稱下改寫。
**Migration**: 由 `Time-normalized fairness keeps absolute priority over balance` 全面取代，自願休息與連續上場的絕對優先性維持不變。

## ADDED Requirements

### Requirement: Time-normalized fairness keeps absolute priority over balance
Balance MUST only decide among candidates that the time-normalized fairness rules have already declared equivalent. At proposal time, eligible candidates MUST be partitioned into ordered play-rate layers using the lowest not-yet-layered precise rate as the anchor and a fixed inclusive tolerance of 0.5 appearances per hour. Candidates whose rates are no greater than the anchor plus the tolerance belong to that layer. A candidate in a lower-rate layer MUST be selected before a candidate in any higher-rate layer. Within one rate layer, fewer consecutive appearances MUST remain strictly prior to Rating balance. Voluntary rest MUST remove a candidate from selection entirely.

#### Scenario: Rate difference crosses the fairness band
- **WHEN** one eligible candidate has a rate more than 0.5 appearances per hour above the current layer's minimum
- **THEN** every candidate needed from the lower-rate layer is selected first regardless of the resulting team gap

#### Scenario: Rate difference stays inside the fairness band
- **WHEN** eligible candidates' precise rates are within 0.5 appearances per hour of their layer's minimum
- **THEN** they share the same play-rate layer and the next fairness key decides between them

#### Scenario: Fairness layers are minimum-anchored rather than chained
- **WHEN** candidate rates are 1.0, 1.4, and 1.8 appearances per hour
- **THEN** 1.0 and 1.4 form the first layer and 1.8 forms a later layer even though 1.4 and 1.8 differ by only 0.4

#### Scenario: Consecutive appearances break a rate-layer tie
- **WHEN** two candidates share a play-rate layer and have different consecutive-appearance counts
- **THEN** the candidate with fewer consecutive appearances is selected first even when the other would balance better

#### Scenario: Voluntary rest is absolute
- **WHEN** a candidate has marked voluntary rest
- **THEN** they are placed in the rest list and are never considered for balance, whatever gap results

## MODIFIED Requirements

### Requirement: The playing group and the split are chosen jointly within a tie group
Among candidates tied on play-rate layer and consecutive-appearance count, the product MUST choose which of them play and how they are split as one decision, minimizing the absolute difference between the two teams' Rating sums. Candidates from stricter fairness groups that have already been admitted MUST remain in the playing group and participate in the split.

#### Scenario: Every eligible candidate is tied
- **WHEN** all eligible candidates share the same play-rate layer and consecutive-appearance count and more of them are present than a match needs
- **THEN** the selected group and split minimize the team Rating gap over every fairly equivalent choice

#### Scenario: The tie group only partly fills the match
- **WHEN** some candidates are strictly fairer than the boundary tie group and do not fill the match by themselves
- **THEN** those candidates all play and only the remaining places are chosen from the boundary tie group

#### Scenario: The tie group exactly fills the match
- **WHEN** the fairness ordering admits exactly the number of players a match needs
- **THEN** the playing group is fully determined by fairness and only the split is optimized

### Requirement: Variety is preserved among equivalent options
Fairly equivalent options whose best team Rating-sum gap differs by no more than 25 Rating points from the best available gap MUST be treated as balance-equivalent, and one MUST be chosen at random using the injected random source. Selection MUST NOT be a deterministic function of ratings alone.

#### Scenario: Several options balance equally well
- **WHEN** more than one fairly equivalent option has a best team gap no greater than the global best gap plus 25 Rating points
- **THEN** the choice among them varies across runs with different random sources

#### Scenario: Repeated rounds with an unchanged roster
- **WHEN** the same fairness snapshot is proposed repeatedly with no match or eligibility event recorded
- **THEN** selected groups and pairings can vary rather than repeating one arrangement

#### Scenario: A player far from the rest of the field
- **WHEN** a candidate is fairly equivalent to others but their Rating makes groups containing them balance poorly outside the 25-point tolerance
- **THEN** they may rest for that proposal, and their unchanged appearance count plus increasing eligible time can move them into a stricter lower-rate layer in a later proposal

#### Scenario: A given random source is reproducible
- **WHEN** the same candidates, precise rate snapshot, evaluation time, and seeded random source are supplied
- **THEN** the proposal is identical

### Requirement: The search is bounded and degrades to current behaviour
The number of enumerated joint playing-group options MUST be bounded at 10,000. When a boundary tie group would exceed that limit, the product MUST fall back to the same time-normalized fairness order, select the required players from that order, and run only the split search within the resulting group. It MUST NOT silently truncate joint enumeration in a way that presents a partial search as complete.

#### Scenario: Tie group is within the limit
- **WHEN** enumerating the boundary tie group produces no more than 10,000 playing-group options
- **THEN** the joint search runs over every fairly equivalent option

#### Scenario: Tie group exceeds the limit
- **WHEN** the boundary tie group would produce more than 10,000 playing-group options
- **THEN** the bounded fallback selects by time-normalized fairness order and still produces the best split for those selected players

#### Scenario: Not enough eligible candidates
- **WHEN** fewer eligible candidates are present than the match mode needs
- **THEN** no proposal is produced

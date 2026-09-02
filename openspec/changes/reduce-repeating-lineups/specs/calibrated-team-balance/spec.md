## ADDED Requirements

### Requirement: Wildcard-selected playing sets retain calibrated team splitting
When a valid rotation wildcard has replaced one member of the normal playing set, the system MUST apply the existing exhaustive or bounded-fallback team split search to the resulting actual playing set. The best team Rating-sum gap and the existing 25-point balance-equivalence tolerance MUST remain the only rules for choosing among team splits. Rotation wildcard MUST NOT make an otherwise out-of-tolerance split eligible.

#### Scenario: Wildcard playing set has one best split
- **WHEN** the one-seat wildcard playing set has a uniquely best Rating-sum split
- **THEN** the system selects that split

#### Scenario: Wildcard playing set has several balance-equivalent splits
- **WHEN** several team splits are within 25 Rating points of the best gap
- **THEN** the system selects among those splits using the injected random source

#### Scenario: Fully random split is poorly balanced
- **WHEN** a random split is more than 25 Rating points worse than the best available gap
- **THEN** it remains ineligible even though the playing set originated from a wildcard

## MODIFIED Requirements

### Requirement: Time-normalized fairness keeps absolute priority over balance
For every normal proposal, Rating balance MUST only decide among candidates that the time-normalized fairness rules have already declared equivalent. At proposal time, eligible candidates MUST be partitioned into ordered play-rate layers using the lowest not-yet-layered precise rate as the anchor and the one explicitly approved fixed inclusive appearances-per-hour tolerance. Candidates whose rates are no greater than the anchor plus that tolerance belong to that layer. For normal selection, a candidate in a lower-rate layer MUST be selected before a candidate in any higher-rate layer. Within one rate layer, fewer consecutive appearances MUST remain strictly prior to Rating balance. Voluntary rest MUST remove a candidate from selection entirely. Only after a complete normal proposal would repeat the actual playing set from two completed matches earlier MAY the separately specified rotation-wildcard capability replace exactly one normal player with one other eligible player; this exception MUST NOT alter how teams are balanced within the resulting playing set.

#### Scenario: Rate difference crosses the fairness band
- **WHEN** one eligible candidate has a rate above the current layer's minimum by more than the approved fixed tolerance and no wildcard is applied
- **THEN** every candidate needed from the lower-rate layer is selected first regardless of the resulting team gap

#### Scenario: Rate difference stays inside the fairness band
- **WHEN** eligible candidates' precise rates are within the approved fixed tolerance of their layer's minimum
- **THEN** they share the same play-rate layer and the next fairness key decides between them

#### Scenario: Fairness layers are minimum-anchored rather than chained
- **WHEN** three rates place the middle rate within the approved tolerance of both the lowest and highest rate but the highest rate lies outside the tolerance from the lowest
- **THEN** the lowest and middle rates form the first layer while the highest forms a later layer

#### Scenario: Consecutive appearances break a rate-layer tie
- **WHEN** two candidates share a play-rate layer and have different consecutive-appearance counts
- **THEN** the candidate with fewer consecutive appearances is selected first even when the other would balance better

#### Scenario: Voluntary rest is absolute
- **WHEN** a candidate has marked voluntary rest
- **THEN** they are placed in the rest list and are never considered for normal selection or rotation-wildcard exchange, whatever gap results

#### Scenario: Eligible repeat triggers the explicit exception
- **WHEN** a complete normal playing set would repeat the actual playing set from two completed matches earlier and the wildcard draw succeeds
- **THEN** exactly one normal seat may cross fairness layers according to the rotation-wildcard specification before calibrated team splitting runs

#### Scenario: Wildcard is ineligible or misses
- **WHEN** the normal playing set does not repeat, cooldown or degraded mode blocks wildcard behavior, or the draw misses
- **THEN** no candidate crosses a normal fairness priority boundary

## Why

Glicko currently learns one bit per match: who won. A 15:13 and a 15:0 move every rating by exactly the same amount. The final score is recorded, shown in history, and — since `scoring-format-snapshots` — accompanied by the rules that give it meaning, but the rating never reads it.

`docs/research/pickleball-rating-systems.md` measured what that costs. Replacing the binary outcome with the win probability implied by the observed rally performance recovers each player's true skill **12–14% more accurately at the same number of matches**, equivalent to roughly 1.3–1.5× the data. The advantage holds across the whole confidence interval of the calibration coefficient and grows, rather than shrinks, when per-match form noise is added.

The same study explains why this improvement is invisible in matchmaking: four players' rating errors partly cancel, so a 40-point individual error moves the expected match margin by about 0.03 points. Team balance is insensitive at this scale. **Individual ratings are not** — they are displayed to players, compared between friends, and watched over time. That is where the accuracy is worth having.

This mirrors what pickleball's DUPR did in July 2025, but keeps Glicko-2: DUPR's Reliability Score is a coarser reinvention of rating deviation, which this product already has.

## What Changes

- Replace the binary match outcome fed to Glicko with a performance score: estimate the per-rally win rate from the final score, then convert it to a win probability under the match's frozen scoring format.
- Fall back to the current 1/0 outcome whenever the match's format is unknown, because the conversion needs `target`, `winBy`, and `cap` and must never assume them.
- Extract the endpoint distribution into its own module so both the rating path and the existing display helper use one implementation.
- Leave every other part of Glicko-2 untouched: the update equations, tau, rating deviation, volatility, initial ratings, replay boundaries, and the paper-example tests.

## Capabilities

### New Capabilities

- `performance-score-rating`: derive Glicko's observed score from the final score under a known scoring format, with an explicit fallback for unknown formats.

### Modified Capabilities

- `scoring-format-snapshots`: its rating-authority requirement stated that two matches with the same winner and different valid formats must produce identical ratings. That invariant was correct while the format was provenance only; this change makes the frozen snapshot determine the observed score, so it is amended. Glicko-2's equations remain unchanged and remain the sole authority. The invariant is retained in the narrower form that still holds: two unknown-format matches with the same winner rate identically regardless of margin.

## Non-Goals

- **No retroactive change.** Every existing match is `legacy-missing`, so all of them keep the binary path and no stored rating changes when this ships.
- **No new rating model.** Glicko-2 stays the sole authority; only the observed score changes.
- **No change to matchmaking.** `src/lib/matchmaking.ts` keeps its own inputs and must not import this module.
- **No displayed forecast.** Nothing new is shown to players; ratings keep their current presentation.
- **No calibration coefficient.** The conversion uses only the observed score and the frozen format. `beta` is not involved, so a wrong `beta` cannot affect ratings.

## Impact

- **New module** (`src/lib/endpoint-distribution.ts`): the rally-level dynamic program, shared by the rating path and `expected-margin.ts`.
- **`src/lib/glicko2.ts`**: `applyMatch` derives the observed score from the match's format and scores instead of a bare 1/0. `updateRating` is unchanged.
- **Signature change**: `applyMatch` now needs the match's `scoringFormat`, which propagates to `replayRatings`, `recalcAll`, `sessionRatingReport`, and the store's live update. All callers already hold a full `Match`.
- **Ratings under the new path compress**: simulated spread falls from 0.87× to 0.66× of true skill. This is near-uniform, so team-split ranking is unaffected; displayed numbers cluster somewhat more.
- **Determinism and replay**: the conversion is a pure function of the stored match, so replay stays reproducible and history edits behave as before.
- **Cost**: one dynamic program per distinct (format, rally rate) pair, memoised. Distinct values are few because the rate is a ratio of small integers.

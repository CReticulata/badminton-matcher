## Why

The matchmaker picks who plays and then balances the teams. Those are two decisions, and only the second one currently optimizes for balance.

`generateRound()` shuffles the eligible players, stable-sorts them by play count then consecutive plays, and takes the first `need`. Among players tied on both fairness keys — which is every player in the first round, and a large group in most rounds — **which of them plays is decided by the shuffle alone**. `balanceTeams()` then finds the best split of those already-chosen four.

Measured on the current roster with all ten players tied, across the 210 equally fair ways to choose four:

| Team rating gap after the best split | |
|---|---:|
| Best possible choice of four | 2 |
| Median choice | 104 |
| **Expected value of the current random choice** | **154** |
| Worst choice | 510 |

The balance information is available and fairness-free — the change simply never uses it.

A second, smaller gap: the product cannot say how lopsided a proposed match is. The preview screen lets people swap players by hand, but gives them no basis for deciding whether to bother. `docs/research/score-aware-margin-calibration.md` fitted `beta = 0.2552` (95% CI `[0.096, 0.424]`), which maps a rating difference to an expected point margin under a known scoring format — now recorded per session by `scoring-format-snapshots`.

## What this change is not

An earlier reading of the calibration study suggested replacing the balance objective with expected margin. **That would be a no-op.** Expected margin is a strictly increasing function of the rating gap (gap 0 → 4.48 points, 100 → 5.06, 200 → 6.47, 400 → 9.61), and a monotone transform does not move an argmin. Ranking splits by expected margin selects exactly the split that minimizing the rating gap already selects.

Expected margin is therefore adopted here as a **unit of expression** — for display and for thresholds a human can reason about — not as a new objective function. The behavioural improvement comes entirely from widening the search to the tie group.

## What Changes

- Choose the playing group and the split **jointly** across candidates tied on both fairness keys, minimizing the team rating gap. Candidates that are not tied keep strict priority; no player is ever passed over in favour of a player with more plays or a longer consecutive run.
- Preserve variety: among options whose balance is materially equivalent, keep choosing at random. Deterministic optimization would systematically seat the mid-rated players and bench the extremes within every tie group.
- Bound the search and fall back to current behaviour when the tie group is too large to enumerate.
- Add `expectedMargin(ratingGap, format)`: a pure function returning the expected point margin under a structured scoring format, using the frozen endpoint model and the calibrated `beta`.
- Show that figure on the preview screen as a coarse, clearly approximate readout, so a manual swap is an informed decision.
- Leave Glicko, ratings, history, replay, and persistence untouched.

## Capabilities

### New Capabilities

- `calibrated-team-balance`: joint selection and splitting within fairness ties, and a calibrated expected-margin readout for structured scoring formats.

### Modified Capabilities

_None. `scoring-format-snapshots` supplies the format; its requirements are unchanged._

## Non-Goals

- **No change to the fairness rules or their order.** Play count and consecutive plays keep absolute priority over balance. This change only decides among candidates those rules have already declared equivalent.
- **No new rating model.** `beta` calibrates a display and a threshold; it never writes rating state and never feeds Glicko.
- **No precise prediction shown to users.** The CI on `beta` spans a factor of 4.4. A readout that implies a specific final score would overstate what 29 matches support.
- **No user-editable `beta`, no automatic refitting.** It stays a documented constant with recorded provenance; refitting is a manual research step.
- **No multi-court, no scheduling, no lookahead across future rounds.**

## Impact

- **`src/lib/matchmaking.ts`**: `generateRound()` gains joint selection over the tie group; `balanceTeams()` is reused unchanged as the inner split search. This is the core matchmaking path and the main risk surface.
- **New module** (`src/lib/expected-margin.ts`): endpoint distribution and expected margin, pure and dependency-free.
- **`src/components/PreviewView.vue`**: an approximate readout beside the existing manual-swap controls.
- **Unknown scoring format**: no readout, no threshold; selection still improves, because the tie-group search uses rating gaps and needs no format.
- **Determinism**: `generateRound` keeps its injected `Rng`, so tests stay reproducible.
- **Performance**: enumeration is bounded; the practical worst case for this product is a first round with every player tied.
- **Rating authority**: unchanged. `src/lib/glicko2.ts` is not modified.
- **Dependency**: requires `scoring-format-snapshots` (PR #6) for the format the readout needs. The selection improvement does not depend on it.

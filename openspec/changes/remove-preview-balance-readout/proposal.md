## Why

`calibrated-team-balance` requires the preview screen to show an approximate indication of how lopsided a proposed match is likely to be. That readout was removed from the product in `90dd3f8`, so three of the capability's scenarios now describe behaviour that does not exist. The spec and the product disagree, and the spec is the one that is wrong.

The removal was the right call. The measurements behind the readout are in `docs/research/pickleball-rating-systems.md`: the balance difference the readout was describing is 0.05–0.08 points of expected margin on average, and about 0.34 points even in the roughly one round in eight where the proposed split actually differs. A figure that small, shown next to a manual-swap control, invites decisions it cannot support — and the calibration coefficient behind it has a confidence interval spanning a factor of 4.4.

With the readout gone, `src/lib/expected-margin.ts` has no caller. Nothing in `src/` imports it except its own tests, and the capability that required it explicitly forbids matchmaking from depending on it. Its dynamic program already lives in `src/lib/endpoint-distribution.ts`, where the rating path uses it; its calibration coefficient, confidence interval, and sample size are recorded in `docs/research/score-aware-margin-calibration.md`.

## What Changes

- Remove the two requirements that exist only to describe the readout: the user-facing indication and the display-only expected-margin helper.
- Delete `src/lib/expected-margin.ts` and its tests.
- Keep everything the capability is actually about: fairness priority, joint selection within a tie group, variety among equivalent options, the bounded search, and the rule that matchmaking must not depend on the scoring format or a calibration coefficient.

## Capabilities

### Modified Capabilities

- `calibrated-team-balance`: two requirements removed. The capability keeps its name — the joint search is still the calibrated part, in the sense that it optimizes a measurable balance objective; it simply no longer surfaces a figure to the user.

## Non-Goals

- **No change to selection behaviour.** The joint search, the tolerance, the random tiebreak, and the bound are untouched.
- **No loss of the underlying maths.** The endpoint distribution stays in `src/lib/endpoint-distribution.ts` and is used by the rating path.
- **No loss of the calibration record.** `beta`, its interval, and its provenance remain in `docs/research/score-aware-margin-calibration.md` and in the scripts beside it.
- **No statement that the readout was a bad idea in principle.** If a future change wants to show players how lopsided a match looks, it should re-derive what to show from data available then, rather than inherit a constant fitted on 29 matches.

## Impact

- **Removed**: `src/lib/expected-margin.ts`, `src/lib/__tests__/expected-margin.test.ts`.
- **Unaffected**: `src/lib/matchmaking.ts` never imported either module, and the test asserting that moves to the performance-score suite, which already carries the same assertion.
- **Reversibility**: the module and its tests remain in git history; restoring them is a revert, not a rewrite.

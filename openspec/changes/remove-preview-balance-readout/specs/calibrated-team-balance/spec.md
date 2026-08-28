# Calibrated Team Balance

## REMOVED Requirements

### Requirement: Expected margin is derived only from a structured format

**Reason**: the helper existed solely to produce the preview readout, which was removed in `90dd3f8`. Nothing in `src/` imported it afterwards. Its dynamic program is retained in `src/lib/endpoint-distribution.ts`, where the rating path uses it, and its calibration coefficient with interval and sample size is recorded in `docs/research/score-aware-margin-calibration.md`.

**Migration**: none. No stored data, rating, or proposal depended on it; matchmaking was already forbidden from importing it.

### Requirement: The readout must not imply unwarranted precision

**Reason**: the readout was removed from the preview in `90dd3f8`, so the requirement described behaviour the product no longer has. The balance difference it described is 0.05–0.08 points of expected margin on average, and about 0.34 points in the roughly one round in eight where the proposed split differs at all; the coefficient behind it has a confidence interval spanning a factor of 4.4. A figure that small next to a manual-swap control invites decisions it cannot support.

**Migration**: none. The preview keeps its manual-swap controls unchanged; only the indication is gone.

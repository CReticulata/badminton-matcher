## Why

Every match this product records stores a final score without recording the rules that made that score meaningful. A 15:12 and a 21:12 are different events, and nothing in `Match` distinguishes them.

This is time-sensitive rather than merely tidy. All 29 matches in the current export are 15/2/21, but that fact exists only in the owner's head — the data cannot express it, and `docs/research/score-aware-margin-calibration.md` had to assume it. Every session played before this ships adds more matches whose format is permanently unrecoverable, because inferring a format from a final score is forbidden: 15:12 is legal under both catalog formats. Data quality lost here cannot be repaired later.

The offline calibration study gives a second, concrete reason. Its endpoint model needs `target`, `winBy`, and `cap` per match to compute anything; the superseded research branch hardcoded `badminton-21-w2-c30` and would therefore have degraded every match in this product's history to winner-only, silently producing an empty result. Format must be data, not a constant.

A prior version of this capability was specified and implemented on the abandoned `feat/initial-skill-levels` branch. That branch is now 14 commits behind `main` and conflicts in `src/store.ts`, `src/lib/csv.ts`, `src/components/SessionView.vue`, and `src/App.vue` — the exact files `main` rewrote for player archiving and fixed session replay boundaries. This change re-lands the capability against current `main` rather than merging that branch.

## What Changes

- Introduce a versioned, immutable scoring-format snapshot with three exact variants: `catalog`, `custom`, and `unknown`. A snapshot is selected before play, copied into the match, and never edited afterwards.
- Give every session an explicit prospective default, including a deliberate `unknown` choice. Changing a default affects only matches that have not yet started.
- Validate terminal scores against the frozen structured rules before a match is persisted and before Glicko runs. Unknown-format matches keep the current generic validation.
- After reporting an illegal endpoint, offer to record the match anyway as an explicitly unrated match: kept in history and in participation/rotation statistics, excluded from every rating path. Real games sometimes end early — injury, court time, a called match — and the product must not force a fictional score or silent data loss as the only options.
- Load legacy records that omit format fields as explicit `legacy-missing` unknown. Reject records that declare a snapshot but contain malformed or self-contradictory fields, atomically, rather than downgrading them to unknown.
- Replace the current `loadData()` catch-and-empty fallback with a normalization boundary and a blocking recovery state, so malformed local data is preserved instead of being overwritten by the deep persistence watcher.
- Extend CSV export/import with format columns in the existing `[sessions]` and `[matches]` sections, preserving round-trip fidelity alongside the existing opening snapshots, baselines, overrides, and archive fields.
- Keep Glicko winner-only and unchanged. Format metadata is provenance and validation only.

## Capabilities

### New Capabilities

- `scoring-format-snapshots`: explicit scoring-format identity, immutable per-match snapshots, catalog/custom/unknown semantics, endpoint validation, local persistence with blocking recovery, CSV round-trip, and legacy unknown behavior.

### Modified Capabilities

_None._

## Non-Goals

These are named explicitly because each one is a plausible and wrong next step.

- **No backfill.** Existing matches stay `legacy-missing` even though the owner knows they were all 15/2/21 and even though their scores are legal under exactly one catalog entry. Recording a guess as provenance defeats the purpose of the change.
- **No matchmaking change.** `expectedMargin(Δrating, format)` and the balance-objective change proposed in `docs/research/score-aware-margin-calibration.md` are a separate later change. This one only makes the input data exist.
- **No rating change.** No score-aware likelihood, no shadow model, no alternative rating runtime, no change to Glicko's equations, initial ratings, or player-visible rating output. The unrated flag changes only *which* matches are fed to Glicko, never how Glicko computes.
- **No completed-format correction.** A wrong completed snapshot stays visible and immutable. Correction needs audit, replay, and sealed-history semantics of its own.
- **No replay-boundary change.** Fixed session opening snapshots and the rule that history edits must not cross into the next session are untouched.
- **No storage-platform change.** No IndexedDB, no key version bump, no backend.

## Impact

- **Types** (`src/types.ts`): `Session` gains `defaultScoringFormat`; `Match` gains `scoringFormat` and an optional `excludedFromRating`. Both are required on new records and reconstructed on load.
- **New module** (`src/lib/scoring-format.ts`): schema, catalog, constructors, validation, endpoint legality, canonical serialization, display labels. Pure and browser-safe.
- **Store** (`src/store.ts`): `loadData()` becomes normalize-or-block; `startMatch()` freezes a snapshot; `submitScore()` and `editMatchScore()` validate against it before any rating effect.
- **Replay interaction**: `editMatchScore()` already replays from the session opening snapshot. Format validation runs before that replay and rejects the edit; it never alters which events replay or where the boundary sits.
- **Archiving interaction**: archived players' historical matches keep their snapshots. Archiving remains reversible and format-independent.
- **CSV** (`src/lib/csv.ts`): one new column per affected section, canonical JSON per cell. Imports missing the columns remain valid and become `legacy-missing`.
- **UI**: a format picker for session default and pre-start override; read-only display in match, score entry, and history; a blocking recovery screen when local data cannot be normalized.
- **Persistence risk being fixed**: today `loadData()` swallows a parse failure and returns an empty dataset, after which the deep watcher writes that empty dataset over the user's real data. This change makes that path fail closed.
- **Dependencies**: none added. Browser TypeScript only.
- **Verification**: `pnpm test`, `pnpm build`, and a browser walkthrough covering session creation, a match under each variant, a legacy import, and a forced recovery.

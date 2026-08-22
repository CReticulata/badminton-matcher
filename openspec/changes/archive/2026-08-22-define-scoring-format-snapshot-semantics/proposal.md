## Why

The product currently records final scores without recording the scoring rules that made those endpoints meaningful. Score-informed research and future product behavior cannot safely distinguish formats or validate endpoints unless each new match carries explicit format provenance, while legacy records without that provenance remain unknown rather than being inferred from their scores.

## What Changes

- Introduce an explicit, versioned scoring-format snapshot for newly completed matches. A snapshot is selected from an explicit session default or explicit match-level override and is copied into the completed match as immutable historical provenance.
- Define structured supported-format identity and rule semantics separately from explicit `unknown` and `custom/unsupported` states. Supported formats can validate legal terminal scores; unknown or unsupported formats remain distinguishable and must not be normalized into a supported format.
- Preserve legacy and imported matches that lack a snapshot as `unknown`. Do not infer `target`, `winBy`, `cap`, format version, or format identity from final scores, timestamps, session names, or later defaults.
- Extend browser-local persistence and CSV backup/restore so format snapshots round-trip without loss and old data remains loadable through an explicit unknown-format compatibility path. This is an additive product-data change, not an IndexedDB or rating-state migration.
- Add explicit product surfaces for selecting and viewing a session default and any per-match override, while preventing historical snapshots from changing merely because a later default changes.
- Define failure and correction boundaries for malformed snapshots, illegal endpoints under a known supported format, missing legacy metadata, and explicit format correction. Detailed replay effects must preserve the existing mutable-tail and sealed-history boundaries rather than silently reinterpreting history.
- Keep official rating and matchmaking behavior unchanged: Glicko remains winner-only and the sole production authority. Format metadata may establish eligibility for later, separately approved research, but this change does not implement or evaluate a score-aware candidate.
- Explicitly exclude score-aware rating equations, PAR/J1 adaptation, activity-local state, covariance, sigma, simulation or seed execution, IndexedDB, historical format backfill by guess, promotion, migration of rating authority, and production cutover.

## Capabilities

### New Capabilities

- `scoring-format-snapshots`: Defines explicit scoring-format identity, immutable per-match snapshots, supported/unknown/custom semantics, endpoint validation boundaries, local persistence and CSV round-trip, and legacy unknown-format behavior.

### Modified Capabilities

_None. This change conforms to `score-informed-rating-roadmap` without changing its requirements._

## Impact

- **Product data:** `Session` and `Match` data contracts will gain explicit format provenance. Newly completed matches preserve their own immutable snapshot; existing records without one remain unknown.
- **Score entry and history UI:** Session/default configuration, score submission, match display, and any explicit correction flow will need format-aware behavior and clear unknown/unsupported states. The UI must not present inferred legacy formats as facts.
- **Validation:** Known supported formats will use their versioned endpoint rules. Unknown/custom behavior and malformed imported snapshots must fail or degrade through explicitly specified paths rather than guessing.
- **Persistence and portability:** Browser-local serialization and CSV export/import will require backward-compatible, lossless format fields and tests. No backend, Python service, IndexedDB, or large rating-state platform is introduced.
- **Replay and corrections:** A later explicit format correction may affect observation eligibility only within separately specified mutable-history semantics; sealed rating effects and current Glicko authority are not silently rewritten by this proposal.
- **Rating and matchmaking:** No rating calculation, matchmaking input, score-aware prediction, shadow promotion, or player-visible rating forecast changes. Glicko remains the sole production authority.
- **Research and authorization:** No research run, simulation world, formal inference, safety evaluation, protocol advancement, or production authorization is created. Prospective format snapshots are data prerequisites for a later independently preregistered candidate-study change.
- **Dependencies:** No new production dependency is proposed. Implementation remains browser TypeScript with local persistence and CSV portability.

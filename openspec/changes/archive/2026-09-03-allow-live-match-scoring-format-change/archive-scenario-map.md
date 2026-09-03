# RW-56 Archive Scenario Map

Change: `allow-live-match-scoring-format-change`
Base capability: `scoring-format-snapshots`

This map is the pre-archive closure check. It does not authorize or perform archive. `exact` means the base requirement and scenario text must remain byte-for-byte unchanged when the delta is applied.

## Superseded requirement

Base requirement: `Match snapshots are fixed before outcome reveal`
Delta action: remove the requirement and replace it with `Live match scoring format may be replaced before completion` plus `Score drafts are cleared deliberately when the live format changes`.

| Base scenario | Archive disposition | Delta scenario(s) | Rationale |
|---|---|---|---|
| Match uses the session default | renamed-equivalent | Match uses the session default | The detached initial snapshot behavior remains unchanged. |
| Match uses an override | renamed-equivalent | Match uses a pre-start override | Only the name is clarified; the pre-start override remains detached and leaves the session default unchanged. |
| Default changes during a live match | renamed-equivalent | Session default changes during a live match | The live snapshot remains isolated from prospective default changes. |
| Override is attempted after outcome entry begins | intentionally replaced | Format is replaced from the live-match display; Format is replaced repeatedly; Saved replacement is reloaded; Replacement targets stale or inconsistent live authority; Replacement persistence fails; Match completes after replacement; Format draft is cancelled; Blank score form changes format; Non-empty score form confirms replacement; Retained score draft changes format from the live display; Non-empty score form declines replacement; Confirmed replacement is refused; Score-entry format draft is cancelled; Active live identity is replaced by import or recovery | RW-56 intentionally removes the post-start prohibition and replaces it with identity-bound, durable live replacement plus deliberate draft handling. There is no compatibility scenario retaining the prohibition. |

## Unrelated base requirements retained exactly

The following requirements and every listed scenario are outside RW-56's replacement boundary and must remain exact when archiving:

### Scoring formats use a versioned discriminated snapshot

- Catalog format is selected
- Custom structured format is selected
- Format is explicitly unknown
- Snapshot mixes incompatible variants
- Snapshot mutation is attempted

### Structured rules and terminal scores are deterministic

- Game ends at target before deuce
- Game extends above target
- Game reaches cap
- Structured rules are malformed
- Structured rules cannot terminate
- Sudden death at the target is allowed

### Session defaults are explicit and prospective

- New session uses the product default
- User replaces the default before starting
- Product default is never applied to existing data
- Session default changes
- Legacy active session has no default
- Legacy prospective choice is cancelled

### Score submission respects the snapshot without changing rating authority

- Known structured endpoint is legal
- Known structured endpoint is illegal
- Unknown-format endpoint is submitted
- Two formats share a winner
- Two unknown-format matches share a winner

### An illegal endpoint may be recorded only as an unrated match

- Illegal endpoint is force-recorded
- Unrated match is replayed
- Unrated match and fairness
- Force does not bypass shared score rules
- Unrated match is reloaded
- Unrated score is corrected
- Unrated score is edited to another illegal score
- Rated match is edited to an illegal score

### Score edits preserve the frozen snapshot and the replay boundary

- Edited score is legal under the frozen snapshot
- Edited score is illegal under the frozen snapshot
- Edited legacy match has an unknown snapshot

### Legacy absence is unknown and declared corruption fails closed

- Old record omits format columns
- Score resembles exactly one catalog format
- Declared snapshot is malformed
- Declared snapshot contradicts its stored endpoint

### Malformed local data is preserved behind a blocking recovery state

- Local value cannot be normalized
- A mutating command is invoked while blocked
- Recovery succeeds
- Recovery is cancelled or fails
- Write failure is not a recovery state

### Local persistence and CSV round-trip preserve exact provenance

- New-format data round-trips
- Catalog definition later changes
- Import mixes legacy and new rows
- CSV structure is ambiguous
- CSV exceeds the browser import budget

### Completed format provenance is read-only

- User views match history
- User attempts to edit a completed format

### Archived players do not affect format provenance

- Player is archived after playing
- Archived player is restored

## Closure assertions

- No persisted schema or version changes.
- Existing pending, live, completed, imported, and legacy snapshots are not rewritten.
- Completed snapshots remain read-only.
- Only the current live match may replace its whole detached snapshot before completion.
- The final live snapshot is the only snapshot copied to history.
- Session defaults remain prospective and unaffected by live replacement.

## Why

Court availability can change after a badminton match begins, requiring the group to end earlier or extend play. The current pre-start freeze forces users to keep rules they no longer intend to follow or cancel the live match instead of preserving its continuity.

## What Changes

- Allow an in-progress match to replace its scoring-format snapshot from both the live-match display and score-entry flow.
- Keep the same live-match identity, lineup, fairness lineage, and start boundary while replacing only the current match's format.
- Let the format be replaced repeatedly before completion without changing the session default or later matches.
- Treat the latest saved format as the sole completed provenance and the sole authority for terminal-score validation and the Rating observation.
- Keep score drafts as shared, live-match-identity-bound transient UI state across the two entry points. Visibility changes for the same match retain them; replacing or removing the active live identity through completion, cancellation, import, or recovery clears them. When score input is non-empty, require confirmation before applying a replacement and clear both score fields plus score-flow feedback only after the replacement and its persistence succeed; blank score forms switch without that warning.
- Make replacement one identity-checked store command with a distinguishable success or refusal result. Persistence failure rolls both live authorities back, preserves the draft, and leaves the existing persistence warning visible.
- Keep completed-match format editing, format-transition audit history, point-by-point score tracking, and Glicko-2 algorithm changes out of scope.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `scoring-format-snapshots`: Replace the current start-time immutability rule with a bounded live-match replacement rule while preserving final provenance, prospective session defaults, persistence, endpoint validation, Rating authority, and completed-history immutability.

## Impact

- **UI:** The live-match display and score-entry flow gain access to the existing scoring-format choices and score-draft clearing confirmation behavior.
- **Live authority:** The persisted live match may replace its scoring-format snapshot before completion; the latest saved value is authoritative.
- **Rating:** Glicko-2 remains the sole rating authority and its equations do not change. The final replacement snapshot determines endpoint legality and the observed score supplied to Glicko.
- **Persistence and recovery:** A replacement commits only after localStorage persistence succeeds and must recover as part of the same live match. A failed write rolls the live snapshots back rather than reporting success. No new backend, database, or historical event log is introduced.
- **Replay and migration:** Completed records, history replay boundaries, and legacy normalization remain unchanged. No existing completed snapshot is rewritten or inferred.
- **Fairness and matchmaking:** Participants, attendance events, fairness-period lineage, completion chronology, and fairness-first matchmaking order are unaffected.

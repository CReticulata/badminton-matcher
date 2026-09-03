## Context

See `proposal.md` for motivation and `specs/scoring-format-snapshots/spec.md` for normative behavior.

The current flow copies a session default or pre-start override into a recoverable live `MatchContext`, then copies that snapshot into the completed `Match`. Score entry validates against the live snapshot, and the Rating path consumes the completed snapshot. The session already persists its live match through the existing localStorage watcher and normalization boundary.

The change crosses store authority and two Vue surfaces, but it does not require a new persisted field or schema version. Score drafts and validation feedback currently live inside the score-entry component, while the authoritative live snapshot lives in the store.

## Goals / Non-Goals

**Goals:**

- Replace the whole live scoring-format snapshot through one store-owned command.
- Keep live identity, lineup, start time, fairness lineage, and session default unchanged.
- Coordinate both entry points through shared transient score-draft state without moving drafts into durable storage.
- Preserve the existing endpoint-validation, deliberate-unrated, Rating, recovery, and completion paths after replacement.

**Non-Goals:**

- Add a format-transition event log or retain prior live snapshots.
- Change persisted `Session`, `MatchContext`, or `Match` shapes.
- Add durable live point tracking or include score drafts in persisted application data, migration, or recovery.
- Permit completed-format editing or alter replay boundaries.

## Decisions

### Replace by command, never mutate a retained snapshot

Add one store-owned live-format replacement operation whose caller supplies the expected `liveMatchId`. The command validates the ready-state boundary, requires a current session, requires both the reactive and recoverable live authorities to match that identity, validates and clones the supplied snapshot, and prepares whole-object replacements for both authorities. It returns a discriminated result such as `{ ok: true, liveMatchId }` or `{ ok: false, reason }`; every refusal occurs before mutation.

The command builds a candidate application-data value containing independent replacement clones and passes it through the existing backup, write, and warning boundary before mutating reactive state. If candidate persistence fails, both live authorities remain untouched, no deep-watch retry is scheduled, the warning remains visible, and the command returns `persistence-failed`. After persistence succeeds, the command commits independent clones to the reactive and recoverable authorities; the existing deep watcher may later perform only an idempotent write of that same committed state. Thus success means the replacement is both identity-correct and durable, while every refusal leaves no partial mutation.

Whole-object replacement preserves the scoring-format module's immutable snapshot and no-alias guarantees. Mutating nested rules would violate the existing provenance contract; changing only the UI copy would fail recovery.

**Alternative considered:** reuse the session-default setter. Rejected because it intentionally affects pending and future matches and would leak a current-match decision into later rounds.

### Share transient score-draft authority across both entry points

One transient, non-persisted live score-flow coordinator owns a `liveMatchId`, both raw inputs, any validation error, and the force-unrated offer even while score entry is hidden. Both format entry points reconcile that owner against the active live identity before inspecting the state and therefore use the same conditional confirmation. Hiding score entry for the same identity retains the state. Completion, cancellation, session replacement, successful import, recovery, or any other transition to a different or absent live identity clears it before use. On confirmation the initiating surface invokes the identity-bound store replacement; only a matching success result clears both inputs and feedback. On decline or any refusal it clears nothing.

This ordering prevents UI loss when a replacement cannot be applied at the store boundary. A blank form can invoke the command directly and needs no clearing confirmation.

**Alternative considered:** put score drafts in persisted application data so the replacement command can clear them. Rejected because drafts are transient UI state, no reload behavior requires them, and expanding durable authority would add migration and recovery complexity unrelated to RW-56.

### Reuse the existing picker on both live surfaces

The existing picker remains the sole creator of catalog, custom, and explicit-unknown snapshots. Each live surface wraps it with local open/close state and submits only a fully validated saved snapshot.

Both entries consult the shared transient score draft because hiding score entry does not destroy its component-local state today. Cancelling either picker drops only its picker draft and leaves the saved format and complete score-flow state unchanged.

**Alternative considered:** add a reduced catalog-only switcher to the live display. Rejected because it would create two format capability sets and prevent custom or explicit-unknown live replacements that are valid before play.

### Preserve final-only provenance

No transition metadata is stored. Each successful, durable replacement supersedes the previous live snapshot, and normal completion copies only the current snapshot into history. Persistence and recovery already serialize the live context, so the replacement needs no new field or migration; the command nevertheless owns the immediate persistence attempt and rollback needed before transient score drafts may be cleared.

Rating remains deterministic from the completed match record: endpoint legality and performance score read the one final snapshot. Existing completed matches and replay boundaries are untouched.

**Alternative considered:** record every transition with its timestamp or current score. Rejected because the product selected direct replacement, the app does not track point-by-point score state, and the current Rating model accepts one format per match.

## Risks / Trade-offs

- **Outcome-aware replacement can change how the whole match is interpreted** → The UI presents the current format clearly, score drafts are cleared on replacement, and the specification records final-only authority; no claim of mixed-format modeling is made.
- **Reactive and recoverable live state could diverge** → A single command requires both identities to match, persists a complete candidate before mutation, and commits both authorities only after success.
- **The global deep watcher could retry a rejected transaction and clear its warning** → Failed candidate persistence mutates no reactive data, so it schedules no retry; a first-write-only failure test waits through Vue's flush and proves the warning remains visible.
- **A confirmation could clear input even if the store rejected the change** → Clear local state only after the store operation reports success; preserve everything on failure or decline.
- **Two UI entry points could drift** → Reuse the same picker and shared transient score-flow authority, and assert equivalent draft protection and saved-snapshot behavior on both surfaces.
- **Global transient state could leak into a newly imported or recovered live match** → Bind score-flow state to its live-match ID, reconcile before every use, and test every active-live replacement/removal boundary.
- **The live overlay is space-constrained on mobile** → Keep the action secondary and verify portrait and landscape layouts without obscuring cancel or score-entry controls.

## Migration Plan

No data migration or schema bump is required. Existing pending, live, completed, imported, and legacy snapshots retain their stored values. Archive closure uses an explicit scenario map: the old override and default-change scenarios map to their renamed pre-start/session-default equivalents; the former post-outcome prohibition is intentionally replaced by the new live-replacement and deliberate-draft scenarios; all unrelated base scenarios remain exact.

Deployment adds the replacement command and UI entries. Rollback removes those entry points and command; snapshots already replaced before rollback remain valid ordinary live or completed snapshots because their persisted shape is unchanged.

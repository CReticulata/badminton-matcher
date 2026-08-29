## Context

See `proposal.md` for motivation and scope. The current store derives attendance from mutable `Session.presentIds`, `leftIds`, and `volunteerRest`, and derives fairness from completed `Match` records. It has no durable join/leave/rest timing, while `generateRound()` accepts integer play counts and consecutive counts. Persistence is localStorage plus CSV; Glicko replay has separate fixed activity boundaries that this change must not move.

The accepted lineage decision is recorded in `docs/adr/0002-event-sourced-play-rate-fairness.md`. The observable contracts are in `specs/time-normalized-rotation/spec.md` and `specs/calibrated-team-balance/spec.md`.

## Goals / Non-Goals

**Goals:**

- Make every active play-rate value reproducible from persisted timing events, completed matches, a supplied evaluation time, and stable same-timestamp order.
- Keep time projection, event validation, rate-layer construction, and matchmaking pure and deterministic under injected time and RNG.
- Preserve current Glicko, scoring-format, match-history, and activity replay authority.
- Migrate active legacy state without inventing historical attendance timing.
- Separate structurally unreadable app data from fairness-only semantic degradation.

**Non-Goals:**

- Editing historical attendance timestamps or reconstructing timing for ended legacy sessions.
- Persisting a continuously ticking aggregate, using browser uptime, or pausing when the app is backgrounded.
- Changing the Rating model, +25 Rating balance tolerance, 10,000-option search bound, scoring behavior, or multi-court scope.
- Displaying play-rate history for ended sessions or making the 0.5 band configurable.

## Decisions

### 1. Store append-only fairness events with explicit stable sequence

Add an `AttendanceEvent` union with at least:

- `join`
- `leave`
- `voluntary-rest-start`
- `voluntary-rest-end`
- `fairness-reset-requested`
- `fairness-period-started`
- `fairness-recovery-boundary`

Every event carries `id`, `sessionId`, `playerId` when participant-specific, `at`, and a session-local monotonic `sequence`. Array order alone is not sufficient because CSV tools may reorder rows; `(at, sequence)` is the replay order and timestamp `0` is valid. A period-start event's own ID is its stable fairness-period ID. Rejoining does not create a period; it resumes the latest one.

A recovery boundary contains the exact present and voluntary-rest state at recovery and defines a new authoritative suffix. Earlier bytes remain exportable but are not replayed into post-recovery rates. This is necessary because appending ordinary events after an invalid prefix cannot make that prefix valid.

**Alternative considered:** persist only `accumulatedEligibleMs` and `activeSince`. Rejected because match deletion, queued resets, audit, CSV round-trip, and degraded recovery would depend on untraceable mutable totals.

**Alternative considered:** derive same-timestamp order from event kind. Rejected because it silently changes user action order; explicit sequence preserves what happened.

### 2. Use one pure projector as timing authority

Introduce a pure projector with inputs equivalent to:

```text
projectRotationState(session, events, matches, evaluationTime)
  -> { status: valid, participantStates }
   | { status: degraded, reason }
```

For each participant it derives current presence/rest state, current period ID, queued reset state, eligible milliseconds, period appearances, precise appearances/hour, and daily appearances. It validates impossible transitions, unknown session/player/period references, duplicate sequence identities, non-monotonic session sequence, future-inconsistent lineage, and match references to unknown periods.

An open eligible interval contributes `max(0, evaluationTime - startAt)`. Production passes the proposal/display time; tests pass a fixed clock. No timer writes elapsed milliseconds to storage. The minute UI timer only causes a fresh projection.

Current attendance lists may remain temporarily as legacy import inputs or denormalized compatibility views, but new-session operational state and play-rate authority come from events. If compatibility lists are retained on disk, tests must prove they match the event projection; matchmaking must not choose between conflicting copies.

**Alternative considered:** keep mutable session lists as attendance authority and events only for timing. Rejected because two independent authorities can disagree after import, reload, or partial writes.

### 3. Attribute appearances to period IDs frozen at match start

Extend live match context with a map from each actual playing participant ID to the fairness-period ID active when `startMatch()` runs. Persist the same map on the completed `Match`. Manual swaps before start therefore affect both the player list and captured lineage.

An immediate reset appends a new period-start event. A reset requested for a live participant appends a reset-request event tied to the live match identity; completion or cancellation appends the new period-start event at that boundary. The live match's remaining duration and any completed appearance stay in the old period. Duplicate requests for the same player/live identity are idempotent or rejected, never stacked.

If a reload makes the prior live context recoverably cancellable rather than resumable, resolving that context as cancelled is the boundary that activates queued resets. The system must not activate them merely because time passed.

**Alternative considered:** assign an appearance to whichever period is current when score entry completes. Rejected because a reset during play would move a match across an already-established authority boundary.

### 4. Compute precise rates, then construct minimum-anchored layers

Use integer milliseconds until the final calculation:

```text
rate = appearances * 3_600_000 / eligibleMilliseconds
```

A zero-duration current period has rate `0` for ordering. At proposal time:

1. Exclude voluntary rest and require 2 or 4 eligible participants by mode.
2. Sort by precise rate for layer construction.
3. Take the lowest unlayered rate as anchor; all remaining candidates with `rate <= anchor + 0.5` join that layer.
4. Repeat with the next unlayered minimum.
5. Apply strict lexicographic fairness: rate-layer index, then consecutive appearance count.
6. Within the boundary tie group, retain joint playing-group/split enumeration, +25 Rating tolerance, injected randomness, and 10,000-option fallback.

Layer construction happens before random tie ordering so RNG cannot change layer membership. The proposal stores or captures its candidate fairness snapshot; elapsed time alone does not invalidate it. Eligibility-changing events cancel pending proposals.

**Alternative considered:** pairwise `abs(a.rate - b.rate) <= 0.5`. Rejected because tolerance equality is non-transitive and cannot define a valid sort.

**Alternative considered:** fixed buckets such as 1.0–1.49. Rejected because arbitrary global boundaries make nearly identical values on opposite edges strictly different.

**Alternative considered:** optimize projected post-match rate spread. Rejected because a newly joined participant can appear artificially expensive to select after adding one hypothetical match, conflicting with the chosen immediate low-rate ordering.

### 5. Keep daily statistics and fairness-period statistics separate

Daily total remains derived from every completed match in the activity, including forced unrated matches. Current-period appearances use only match lineage assigned to the current period. A reset changes only the current fairness period. Score-only edits preserve lineage; match deletion removes the match from both daily totals and its attributed period, then reprojects without altering attendance events.

Consecutive appearance count remains derived from actual completed lineups across singles and doubles and is not reset by a fairness-period reset. This preserves its distinct fatigue/rotation meaning.

### 6. Migrate only the active legacy boundary

On first normalization of an active legacy session without timing events:

- append one migration/recovery boundary at the injected migration time;
- create a new period for every currently present participant;
- preserve current voluntary-rest status so resting periods begin paused;
- set current-period appearances to zero by leaving all pre-migration matches without new-period lineage;
- preserve matches, daily totals, Rating state, scoring snapshots, session opening snapshots, overrides, and baselines exactly.

Ended legacy sessions remain byte-semantically unchanged with no fabricated timing events. Migration must be idempotent: once a boundary exists, reload cannot append another one.

**Alternative considered:** infer joins from session start or first appearance. Rejected because both fabricate eligibility time and can reverse fairness decisions.

### 7. Distinguish structural recovery from fairness degradation

Existing persistence recovery remains authoritative for malformed app data that cannot be safely loaded at all. Fairness degradation applies only when the base app data is readable but the timing event/lineage projector rejects its semantic history.

In fairness-degraded mode:

- `generateRound()` receives the existing session-total play counts and consecutive counts;
- a persistent banner states that play-rate fairness is inactive;
- matches and Rating continue normally;
- raw export remains available;
- invalid event history is neither rewritten nor silently truncated;
- degraded matches do not receive fabricated reliable period lineage.

The repair action is available only at a safe live-match boundary. It appends one recovery boundary for all currently present participants, preserving current rest state, and resumes event authority from that suffix. Pending preview is cancelled. If a live match exists, repair is queued until completion/cancellation so the boundary is atomic.

**Alternative considered:** fail closed for all pairing. Rejected by product decision in favor of continued operation with explicit disclosure and a bounded repair path.

**Alternative considered:** silently fall back. Rejected because users would believe displayed play rates still govern pairing.

### 8. Extend CSV and normalization without changing Rating replay

Add a dedicated CSV section for attendance/fairness events with explicit IDs, event kinds, timestamps, and sequence. Add a stable completed-match field for player-to-period lineage, encoded using the repository's existing safe structured-field conventions rather than inferred from row order. Import validates references after all sections are parsed and preserves unknown-invalid raw input through the existing recovery path.

localStorage normalization and CSV import must use the same migration/projector rules. Attendance events do not enter the Glicko replay timeline and must never reorder matches, overrides, baselines, or session opening boundaries.

### 9. Keep UI updates derived and low-noise

The active roster computes exact state from the projector and displays `rate.toFixed(1)` plus the existing daily total. A single activity-scoped minute tick updates the evaluation time; join/leave/rest/reset/completion actions trigger immediate reactive projection. The per-player reset sits in a secondary menu and uses a confirmation message that daily total and Rating remain unchanged and that the player will usually regain low-rate priority.

Eligibility-changing actions append events and clear `ui.pending`. Time ticks do not clear it. Manual swaps remain unrestricted and produce no fairness warning. Ended history reads retained event data only for persistence/export in this version.

## Risks / Trade-offs

- **[Forgotten active session accumulates overnight]** → This is accepted product behavior; expose the activity's active state clearly and do not invent automatic pauses.
- **[Wall clock moves backward or events arrive out of order]** → Replay by persisted `(at, sequence)`, reject impossible negative intervals or invalid lineage into explicit fairness degradation, and preserve raw export.
- **[Continuous rates differ while the UI rounds equally]** → Matchmaking uses precise values and the UI is explicitly presentation-only.
- **[Reset can be used to gain priority]** → Keep the action secondary and confirmed, but preserve organizer authority as chosen; do not alter history or Rating.
- **[Fallback reintroduces late-join total-count catch-up]** → Show a persistent warning and provide one bounded all-present recovery boundary.
- **[More local data and CSV complexity]** → Keep compact append-only events, no per-minute writes, and add strict round-trip/property tests.
- **[Dual legacy/new attendance representations diverge]** → Make events authoritative after migration and validate any retained compatibility projection rather than consulting both.
- **[Large fairness tie groups still expand combinatorially]** → Preserve the existing 10,000-option bound and explicit non-truncating fallback.

## Migration Plan

1. Add new optional event and match-lineage fields plus pure parsers/projectors behind tests; do not change matchmaking yet.
2. Add idempotent localStorage and CSV normalization. For active legacy sessions, create one migration-time recovery boundary; leave ended sessions without synthetic events.
3. Add event-writing store transitions while continuing to assert compatibility attendance views.
4. Add match-start period capture, queued reset resolution, deletion replay, and fairness-degraded/recovery boundaries.
5. Switch matchmaking candidates from total play count to precise rate layers while preserving consecutive, Rating tolerance, RNG, and search bounds.
6. Add active-roster display, reset confirmation, pending-preview invalidation, degraded banner, and repair action.
7. Run focused unit/integration tests, full Vitest, production build, CSV fixtures, migration fixtures, and real browser workflow.

Rollback before user data is written is a normal code rollback. After new events or lineage are written, users must export a backup before installing an older build; an older build is not authorized to silently discard or reinterpret the new sections. Forward migration remains the supported path.

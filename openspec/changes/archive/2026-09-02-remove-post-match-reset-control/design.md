## Context

See `proposal.md` for motivation. `MatchDisplay.vue` currently imports fairness projection/reset state and renders a `<details>` menu for lineup participants. The same reset capability already exists in `SessionView.vue` under each participant's secondary「更多」menu.

## Goals / Non-Goals

**Goals:**
- Remove the live-overlay reset surface and its component-only dependencies.
- Keep cancel and score-entry actions available and uncluttered.
- Preserve reset behavior through the active-session participant interface.

**Non-Goals:**
- Changing fairness-period events, queued reset semantics, persistence, CSV, replay, matchmaking, or Rating.
- Removing the active-session reset capability.

## Decisions

1. **Delete the live-overlay control rather than hiding it conditionally.** This removes the accidental interaction surface and dead component logic. A feature flag or CSS-only hiding would leave misleading behavior and test surface.
2. **Keep store APIs and fairness event handling unchanged.** The request is an entry-point removal, not a domain capability removal. SessionView remains the sole user-facing reset entry.
3. **Use SSR plus mounted regression coverage.** SSR proves the text/buttons are absent from rendered markup; mounted coverage proves the overlay no longer dispatches reset while SessionView coverage continues to prove the retained entry works.

## Risks / Trade-offs

- **Risk:** Tests could remove all reset coverage while deleting the overlay test. → **Mitigation:** retain and strengthen SessionView reset assertions separately from overlay absence.
- **Trade-off:** Resetting a currently playing participant requires leaving or closing the live overlay to use SessionView. This is intentional to keep the match display focused on match operations.

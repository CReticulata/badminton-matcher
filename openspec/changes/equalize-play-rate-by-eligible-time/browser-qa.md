# Browser QA — equalize-play-rate-by-eligible-time

- Executed: 2026-08-29T14:44:47+08:00
- Driver: `agent-browser 0.35.1`, headed Chromium 151 on Linux ARM64
- App: `http://127.0.0.1:5173/`
- Result: PASS after one browser-found UI fix

## Workflow evidence

1. Created six players and started an activity with A–D.
2. Late-joined E and F; each began at `0.00/時` from actual join time.
3. Started and ended A voluntary rest; UI changed immediately.
4. Generated a preview, manually swapped a player with a rester, and observed no fairness warning.
5. Triggered an eligibility event while the preview modal was open through a browser-level DOM integration probe; the pending preview disappeared and F became present.
6. Confirmed immediate reset copy: `重置上場率不會更動今日上場總數或 Rating。確定重置？`.
7. Started a live match and discovered that the full-screen match overlay made roster reset unreachable. Added a secondary `賽後重置` menu to `MatchDisplay.vue`, with mounted SSR proof, then retested through normal browser refs.
8. Queued A's reset from the live overlay; `A 已排定` and `重置待本場結束` appeared. Reload preserved the live match and queued request.
9. Completed the match 15–10. A retained `今日 1 場` while its new fairness period displayed `0.00/時`; the queued marker disappeared.
10. Waited 61 real seconds. The displayed rates decreased after the minute tick; inspection showed no timer-generated attendance event.
11. Exported CSV, cleared localStorage, reloaded to an empty app, and imported the CSV. Six players, ratings, match/rest totals, active activity, daily totals, rates, and lineage replay returned.
12. Injected two structurally valid but semantically contradictory leave events. Reload showed the persistent degraded warning and legacy count display. Repair restored valid rate projection, retained daily totals, appended one recovery boundary plus six periods, and preserved both raw malformed prefix event IDs.
13. Console contained only Vite connection/HMR debug messages; no application errors.

## Screenshots

- [Initial app](browser-qa/badminton-qa-start.png)
- [Activity start](browser-qa/badminton-qa-session-start.png)
- [Live queued reset after UI fix](browser-qa/badminton-qa-live-reset-fixed.png)
- [Degraded warning and fallback](browser-qa/badminton-qa-degraded.png)

## Automated mounted evidence added

`src/session-fairness-mounted.test.ts` verifies:

- 60-second rate refresh (`60.00 → 30.00/時`)
- no persisted attendance event from a time-only tick
- exact interval cleanup on unmount
- immediate voluntary-rest rendering
- live-overlay reset confirmation and queued feedback

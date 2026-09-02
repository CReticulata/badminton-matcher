## Context

See `proposal.md` for motivation. The current production path computes one proposal in `src/lib/matchmaking.ts`, wraps it with a scoring-format snapshot in `src/store.ts`, freezes a recoverable `MatchContext` at match start, and records the actual final teams in `Match`. `RoundProposal` is currently ephemeral; `Session.liveMatch`, completed matches, localStorage normalization, and CSV are durable authority boundaries.

Time-normalized fairness uses immutable attendance events and frozen match-to-period lineage. Invalid lineage enters visible total-count fallback. Rating balance runs only after the normal fairness order admits candidates, with a 10,000-option bound and a 25-point Rating-gap equivalence tolerance. Glicko-2 and replay do not need wildcard metadata to calculate results.

This change crosses matchmaking, session state, migration, CSV, four UI surfaces, and offline evidence. The fairness-band value is deliberately unresolved until a paired deterministic study passes the agreed effect and fairness gates and the user approves one candidate.

## Goals / Non-Goals

**Goals:**

- Add one general, mode-aware anti-repeat mechanism without an eight-person branch.
- Bound each automatic fairness exception to one changed playing seat.
- Preserve normal team-balance and Rating authority after player selection.
- Make wildcard origin, completion attribution, cooldown, degradation, and migration auditable.
- Produce paired deterministic evidence that separates fairness-band and wildcard effects before changing the production band.

**Non-Goals:**

- Do not remove unrestricted manual lineup editing or classify it as automatic wildcard behavior.
- Do not make probability, cooldown, or fairness band configurable in UI.
- Do not infer wildcard lineage for old matches.
- Do not use simulation, Python, or report artifacts at production runtime.
- Do not claim that one-off screening proves every stochastic tail impossible; disclose p99 and worst cases while gating on the preregistered p95 limits.
- Do not launch a larger confirmatory evidence platform unless the representative study reveals that it is necessary.

## Decisions

### 1. Separate normal proposal generation from one post-selection wildcard transform

Keep normal matchmaking as the baseline authority. Add a pure post-selection operation conceptually shaped as:

```ts
applyRotationWildcard({
  normalProposal,
  mode,
  completedPlayingSets,
  eligibleIds,
  volunteerRestIds,
  cooldownRemaining,
  fairnessReliable,
  rng,
}): RoundProposal
```

The operation first tests eligibility, then consumes one probability draw, one uniform exchange-out draw, and one uniform exchange-in draw only on the relevant paths. It returns the normal proposal unchanged when ineligible or when the draw misses. Before wildcard integration, extract one pure `splitFixedPlayingSet(playing, mode, rng)` seam from the existing joint search: it enumerates only team splits for the supplied fixed set, finds the best Rating-sum gap, and samples only splits whose gap is `<= best + 25`. Both normal fixed-set splitting and the successful wildcard path reuse this seam; calling the current deterministic `balanceTeams` alone would lose balance-equivalent variation, while rerunning `generateRound` could change more than one playing seat.

**Why:** the normal proposal remains observable and testable, one-seat deviation is explicit, and team balance is not conflated with selection randomness.

**Alternatives rejected:**

- Fully randomize all players and teams: unbounded fairness and balance deviation.
- Widen the fairness band only: cannot guarantee that periodic lineups break and conflates a global priority change with targeted variety.
- Add an eight-person branch: violates the general product model.

### 2. Define repeat eligibility from actual completed chronology

Build an order-insensitive playing-set key from the normal proposal. Compare it to the actual `teamA ∪ teamB` of the completed match at index `completed.length - 2` within the active session. Do not skip across chronology to find a same-mode match; differing set sizes naturally do not compare equal. Team assignment, score, manual origin, and prior wildcard origin do not affect the comparison.

Fewer than two completed matches means ineligible. Pending and live matches are not completed history. Eligibility changes continue to invalidate the pending proposal under existing rules, so regeneration evaluates a fresh baseline and performs a fresh conditional draw.

**Why:** this exactly matches the preregistered primary metric and observes what participants actually played, not what an earlier proposal predicted.

**Alternative rejected:** compare only with the previous match or with any recent match. Those detect different patterns and would broaden automatic intervention beyond the agreed `A → B → A` symptom.

### 2a. Persist one rotation-only completion chronology

Add `completionSequence: number` to every completed `Match` and `nextCompletionSequence: number` as a session-local persisted high-water mark. A completion consumes the current high-water value and increments it. Score edits preserve sequence; deletion leaves an unreused gap. Rotation wildcard `t/t-2`, `consecutivePlayCounts`, and simulation fixtures all use this sequence. `at` remains display/event time, and Glicko replay continues to use its existing event timeline without reading either field.

Legacy migration groups matches by session, sorts by ascending `at` and original persisted match-array/CSV-row position for equal timestamps, assigns `1..N`, and stores `N+1` as the high-water mark. Missing fields invoke only this one-time legacy migration. Present duplicate, non-positive, non-integer, cross-session-invalid sequence or high-water state enters blocked recovery.

Both fields live inside the existing session/match JSON in localStorage and existing `[sessions]`/`[matches]` CSV sections; they do not create another file, service, or authority store.

**Why:** timestamp equality and later CSV row reordering can no longer change which actual match is `t-2`, while deleted sequence identities are not reused and Rating authority remains isolated.

**Alternatives rejected:** permanent array/CSV row authority is fragile under restore tooling; rejecting equal timestamps treats a legal clock collision as corruption.

### 3. Preserve independent regenerate semantics without hidden retries

Every explicit proposal generation is one attempt. If its normal playing set repeats two matches back and other gates pass, doubles consumes a 25% draw and singles consumes a 12.5% draw. Regeneration repeats the complete process and may independently hit or miss. UI wording says probability is per generation, never per match.

Production uses the existing injected random-source boundary. Unit and simulation tests use deterministic sources. Random draws are not persisted as future authority; the resulting proposal lineage is persisted only when the match starts.

**Why:** this matches the agreed user-controlled reroll behavior while keeping each call deterministic under a seeded source.

**Trade-off accepted:** repeated regeneration raises cumulative hit probability and permits deliberate fishing for variation.

### 4. Carry one versioned lineage object through proposal, live match, and completed match

Add an optional versioned value:

```ts
interface RotationWildcardLineageV1 {
  readonly schemaVersion: 1
  readonly normalPlayingIds: string[]
  readonly exchangedInId: string
  readonly exchangedOutId: string
}
```

Add `rotationWildcard?: RotationWildcardLineageV1` to `RoundProposal`, inherited `MatchContext`, and `Match`. Canonicalize `normalPlayingIds` by stable player ID order for validation and CSV stability.

At every manual exchange, validate that the current playing set still contains `exchangedInId`, excludes `exchangedOutId`, and otherwise represents the original one-seat substitution. Team A/B movement does not invalidate lineage. If validation fails, clear the proposal lineage immediately. On start, freeze surviving lineage with the same final playing set as fairness-period IDs. On completion, copy it to the match and initialize cooldown.

**Why:** the decision that generated a proposal is not enough; only lineage that survives to actual play may produce cooldown or history claims.

**Alternatives rejected:**

- Infer wildcard from final lineup: cannot distinguish manual authority or old data.
- Store only a boolean: cannot verify manual invalidation or show exchange evidence.
- Event-source each random draw: adds authority and migration complexity without replay value.

### 5. Store cooldown as forward-only active-session operational state

Add optional `rotationWildcardCooldownRemaining?: number` to `Session`, normalized to integer `0..2`; missing legacy value becomes `0`. A valid completed wildcard sets it to `2`. Each later completed match decrements it once, including `excludedFromRating` matches. Proposal, cancellation, incomplete play, score edit, and history deletion do not decrement or recompute it.

When fairness is degraded, both eligibility and decrement are suspended. Repair resumes the preserved value. Ending a session leaves the historical session record untouched, while every newly created session initializes zero.

**Why:** cooldown regulates future automated authority. Deriving it from mutable history would make edits retroactively lock or unlock current behavior.

**Alternative rejected:** recompute from the last wildcard match in current history. This conflicts with the agreed non-retroactive edit/delete semantics.

### 6. Extend existing persistence fields rather than add a new CSV section

- `Session`: add `rotationWildcardCooldownRemaining` and `nextCompletionSequence` CSV columns and include lineage naturally inside the existing JSON-encoded `liveMatch` column.
- `Match`: add `completionSequence` and a JSON-encoded `rotationWildcard` CSV column.
- localStorage: use optional typed fields and strict normalization. Missing fields are legacy defaults; present malformed lineage, unknown schema version, impossible exchange IDs, or cooldown outside `0..2` fails closed through the existing recovery path rather than being silently dropped.
- completed legacy matches remain ordinary matches. Existing active sessions receive cooldown zero. No historical lineups are analyzed during migration.

CSV import remains a complete checkpoint replacement, not a merge. A valid older backup restores the backup's active cooldown, completion sequences, and high-water mark even when that moves operational state backward relative to the current device. The confirmation modal must name these active-session effects, show the backup cooldown when present, and offer export of current data first. Validation finishes before replacement; malformed operational fields leave all current local data untouched.

**Why:** the data belongs to existing session/match aggregates and does not require independent event chronology.

**Alternative rejected:** a `[wildcards]` CSV section. It introduces cross-section identity and orphan handling for data that is one-to-one with session state or a match.

### 7. Keep Rating and fairness-period calculations ignorant of wildcard metadata

Appearance attribution continues to read actual final players and frozen fairness-period IDs. Glicko continues to read actual teams, score, scoring-format snapshot, and existing replay boundaries. Wildcard lineage is presentation and future-automation evidence only. Deleting a wildcard match may alter appearances and Rating under existing rules, but must not rewrite the already-forward cooldown value.

**Why:** an equivalent manually arranged match and wildcard match must have identical sporting consequences.

### 8. Use compact, state-derived UI rather than predictive explanations

- Preview: badge `外卡` plus `A 換入、B 換出`.
- Manual invalidation: remove the badge immediately.
- Live match: compact `外卡` badge only.
- Active session: `外卡冷卻：剩 2 場` or `剩 1 場`; degraded warning says external behavior and countdown are paused.
- History: `輪替外卡` marker with the exchange pair.

All UI derives from current lineage/cooldown data. It does not forecast the next draw or claim future group diversity.

**Why:** the user can audit actual authority without adding a speculative preview that might diverge from the eventual match.

### 9. Treat the simulation as one-off paired research, not a production platform

Implement a pinned development-only TypeScript runner outside `src/` so it can import the same pure production matchmaking functions while remaining outside the Vite production graph. Prefer a pinned `tsx` dev dependency and a script under `docs/research/scripts/`; do not duplicate selection semantics in Python. Keep the runner debuggable and rerunnable after failure; no remote execution, resume system, or heavyweight checkpoint service is required.

Generate one immutable manifest per `(scenario, seed)` before applying any method. Named deterministic random streams separate:

- attendance and voluntary-rest schedule;
- match durations and mode sequence;
- fixed player Rating profile;
- normal proposal tie-breaking;
- wildcard probability and exchange draws.

Methods consume the same manifest. The schedule stream excludes method identity. Use keyed per-round/per-attempt streams rather than one globally consumed stream so branch-specific random consumption cannot change later attendance or durations. Rating values remain fixed covariates in this representative selection study; the study makes no Glicko-learning claim. Equal, continuous, and extreme profiles test selection sensitivity without introducing method-dependent score trajectories.

**Why:** paired manifests isolate the two mechanisms, named streams ensure reproducibility, and importing production pure functions minimizes simulator drift.

### 10. Freeze the evidence contract before the representative run

The runner config records:

- candidate bands: `0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8`;
- methods A/B/C/D for each candidate;
- doubles counts `4..16`, singles counts `2..10`;
- fixed-attendance, late-join, leave/rejoin, voluntary-rest, variable-duration, and mixed-mode families;
- equal, continuous, and extreme Rating profiles;
- seed namespace and replication count;
- exact metric definitions and gate directions.

The representative run uses the same fixed set of at least 500 seeds in every promotion cell. A cell is the full `(mode, participant count, attendance family, match-duration family, Rating profile)` identity. Every cell/seed must have exactly one A/B/C/D counterpart; missing, duplicate, or surplus identities fail before aggregation.

Smoke runs use a small explicit seed subset and are labeled `smoke`; they cannot authorize a value. Before the representative run, freeze the full seed list, scenario manifest, runner source digest, production matchmaking source digest, runtime/dependency versions, and metric schema in a protocol JSON.

Primary result artifacts are:

- canonical protocol/manifest JSON;
- per-scenario/per-seed/per-method metrics CSV;
- machine-readable summary JSON;
- human-readable Markdown report;
- receipt with SHA-256 digests of the preceding files.

The report recomputes summaries from primary rows and verifies exact method counterparts; duplicate or missing pairs fail closed. It reports aggregate, participant-count, attendance, mode, and Rating slices, plus p95, p99, and maxima.

**Why:** the agreed 25% effect and p95 safety gates need stable denominators and paired identities, while a one-off study does not justify a general evidence platform.

### 11. Separate evidence recommendation from production approval

The runner may identify candidates that satisfy all gates and rank them by the lowest mean two-round repeat rate. It cannot change source constants. A version-controlled machine-readable approval manifest must bind:

- the exact report and summary SHA-256 digests;
- the selected candidate value;
- the explicit human approver and approval source/message identity;
- any disclosed slice-level regressions.

A build/release guard recomputes both evidence digests and compares the production constant with the manifest candidate. Any mismatch, missing required field, stale/foreign report, unknown candidate, or malformed approval fails closed. When no complete valid approval manifest exists, the guard instead asserts that production remains exactly `0.5`; the local PWA runtime never reads simulation evidence or chooses a value.

Without that validated manifest, production keeps `0.5`. If no candidate satisfies all gates, no approval value is offered and production implementation of a new band stops. Rotation-wildcard code may be developed and tested against `0.5`, but because the product decision is to release wildcard and the approved band together, wildcard generation remains unreleased until the same release gate is satisfied.

**Why:** simulation produces evidence; it does not hold product authority.

## Metric Definitions

- **Two-round playing-set repeat:** for completed chronological match opportunity `t ≥ 2`, one when the actual playing ID set at `t` equals the actual set at `t - 2`, else zero. Normal-proposal-versus-actual equality is recorded separately as trigger-fidelity diagnostic evidence and never substituted for this primary effect metric. The promotion denominator includes only individual opportunities whose final eligibility snapshot has at least one present, non-voluntary-rest participant outside the normal playing set. Retain no-replacement opportunities as separately counted no-op controls.
- **Cumulative appearance shortfall:** at every matched round and player, `baseline cumulative completed appearances - candidate cumulative completed appearances`; each `(cell, seed)` contributes its maximum non-negative participant/checkpoint value.
- **Consecutive non-voluntary rest:** consecutive completed matches during which a participant was eligible, present, not on voluntary rest, and not in the actual playing set. Each `(cell, seed)` contributes its maximum participant run; compare candidate maximum minus paired baseline maximum.
- **Effect aggregation:** within each `(cell, seed, method)`, average actual repeat indicators across eligible opportunities; then average seeds within each cell; then average all promotion cells with equal cell weight. The primary effect is `(equalCellMeanA - equalCellMeanD) / equalCellMeanA` and must be at least 25%. A baseline-zero cell remains in absolute aggregates and disclosures but has no cell-relative division.
- **Fairness gates:** separately inside every cell, sort the paired D-minus-A maxima across its fixed seeds and take conservative nearest-rank `sorted[ceil(0.95 × N) − 1]` without interpolation. Both appearance shortfall and non-voluntary-rest increase must be at most one in every cell. Any cell failure rejects the candidate.
- **Disclosure-only tails:** p99 and maximum for both fairness measures, not promotion gates.
- **Sensitivity only:** pooled and opportunity-weighted aggregates are reported, but cannot rescue a failed equal-cell effect or per-cell fairness gate.

## Risks / Trade-offs

- **[Repeated regeneration makes wildcard nearly user-selectable]** → UI says the probability is per generation; tests verify a fresh draw each time. This is an accepted product choice.
- **[Independent uniform draws can repeatedly exchange out one participant]** → Bound each event to one seat, impose two completed-match cooldown, report p99/max tails, and retain the p95 gate. No anti-repeat bag is added because independent uniformity was explicitly chosen.
- **[Conditional trigger may miss other low-variety patterns]** → Keep the first contract aligned to the measurable `t` versus `t-2` symptom; disclose co-player diversity as a secondary metric without granting it trigger authority.
- **[Changing the band and adding wildcard can confound attribution]** → Require paired A/B/C/D results and slice reports before approval.
- **[Simulator drifts from production matcher]** → Import production pure functions, cross-check fixed fixtures, fingerprint matcher source, and keep simulation code out of `src/` and production bundles.
- **[Fixed Rating profiles omit learning feedback]** → State the estimand as lineup selection under representative fixed profiles; do not claim Glicko dynamics evidence. Add a later study only if selection sensitivity suggests it is material.
- **[History deletion leaves cooldown apparently inconsistent]** → UI and ADR define cooldown as forward-only operational state, not a derived historical statistic.
- **[Older CSV restore moves forward-only state backward]** → Define forward-only only within one current checkpoint lineage. Full overwrite restore intentionally returns all state to the backup checkpoint, warns before replacement, offers current export, and never merges newer local cooldown into older data.
- **[Malformed optional metadata gets silently ignored]** → Validate present fields strictly and enter existing blocked recovery rather than fabricating a default.
- **[Larger fairness bands weaken fairness-first semantics globally]** → Keep explicit approval, p95 gates, fixed candidates, and rollback to `0.5`; no automatic selection.

## Migration Plan

1. Land simulation runner, invariant tests, protocol schema, and smoke evidence without changing the production band or enabling wildcard UI.
2. Freeze and execute the representative paired run; verify primary artifact counts, identities, digests, and summary recomputation.
3. Present the report. If no value passes all gates, stop and retain production `0.5` behavior.
4. After explicit approval, record the selected fixed band in the approval artifact and ADR amendment before production code uses it.
5. Add optional lineage/cooldown fields, strict normalizers, CSV columns, store transitions, and UI behind tested data boundaries. Legacy absence maps only to non-wildcard/zero cooldown.
6. Run focused unit, store, migration, CSV, component, full test, production build, and headed browser acceptance checks.
7. Rollback behavior by restoring the previous fixed `0.5` constant and disabling wildcard generation. Optional persisted metadata remains safely readable and ignored by the prior behavior only if rollback compatibility tests prove that exact version path; otherwise deploy a forward fix rather than downgrading stored schema.

## Open Questions

None. The numeric production fairness band is a deliberately unauthorized release gate, not an unresolved design question; it must be supplied by the approved evidence artifact before the corresponding production task begins.

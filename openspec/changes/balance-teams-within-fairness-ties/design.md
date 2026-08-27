## Context

See `proposal.md` for motivation and `specs/calibrated-team-balance/spec.md` for the contract.

`generateRound()` today: filter out voluntary rest, shuffle with the injected `Rng`, stable-sort by `playCount` then `consecutivePlayCount`, take the first `need`, hand them to `balanceTeams()`, and rest the remainder. `balanceTeams()` enumerates the three doubles splits and returns the one with the smallest rating-sum difference; singles is fixed.

The stable sort means the shuffle decides the order *within* every group of candidates tied on both keys. That is the whole of the current balance decision for selection, and it is uninformed.

## Goals / Non-Goals

**Goals**

- Use the fairness-free information already present: which tied candidates to seat.
- Keep the fairness contract byte-identical in its ordering semantics.
- Keep proposals varied and reproducible under a seeded `Rng`.
- Express lopsidedness in points of badminton rather than rating units, for humans deciding whether to swap.

**Non-Goals**

See `proposal.md`. In particular: no change to fairness rules, no new rating model, no lookahead across rounds, no user-editable calibration.

## Decisions

### 1. Optimize over the boundary tie group only

Partition eligible candidates by the fairness key `(playCount, consecutivePlayCount)`, in the existing order. Admit whole groups while they fit. The first group that does not fit is the **boundary group**: fairness has declared its members interchangeable and only some of them can play.

Everyone in an earlier group plays, unconditionally. The search chooses which boundary-group members fill the remaining places, and how the full playing group splits.

**Alternative considered:** optimize over all eligible candidates. Rejected — it would bench a fairer player to improve balance, breaking the product's stated priority.

**Alternative considered:** keep selection as-is and only reorder within the chosen four. Rejected — that is exactly today's behaviour, and the measurement in `proposal.md` shows it leaves most of the available balance on the table.

### 2. Reuse `balanceTeams()` as the inner search

For each admissible playing group, call the existing split search and take its gap as that group's score. The split logic is already tested and correct; the change is only that it is now asked about several groups instead of one.

Singles has no split, so its gap is `|ratingA - ratingB|` and the search reduces to choosing the pair.

### 3. Treat near-equal gaps as equal, and break the tie randomly

Collect every option within a tolerance of the best gap, then pick among them with the injected `Rng`.

This is not a cosmetic detail. With strict minimization the same mid-rated players are seated in every tie group and the strongest and weakest players are systematically benched until their play counts force them in. That is a fairness regression the fairness keys cannot see, because it happens entirely within a tie. A tolerance in rating points, on the order of the noise in the ratings themselves, restores variety at negligible balance cost.

`Rng` stays injected, so seeded tests remain deterministic.

**Alternative considered:** strict argmin with the existing shuffle as the only tiebreak. Rejected for the reason above — exact ties are rare, near-ties are common.

**Alternative considered:** weight balance against a variety term. Rejected as unnecessary machinery for a group of at most a few dozen options.

### 4. Bound the enumeration and fall back loudly

Enumerate at most a fixed number of options. `C(n, k)` grows quickly, and while this product's real rosters are small, a bound keeps a pathological roster from freezing the round.

When the bound would be exceeded, fall back to the current path — sorted order, first `need`, split search — and record that the wide search was skipped. Silent truncation would let a partial search look like a complete one, which is the failure mode `openspec/config.yaml` calls out for capped work.

### 5. Keep expected margin out of the objective

`expectedMargin(ratingGap, format)` returns the mean absolute margin of the endpoint distribution for `q = sigmoid(beta * ratingGap / 100)` under the format's `target`, `winBy`, and `cap`, computed by the same dynamic program the calibration study used.

It is deliberately **not** the selection objective. Because it is strictly increasing in the rating gap, substituting it would select the same options while adding a coefficient, a format dependency, and a failure mode for unknown formats to the core matchmaking path. Selection stays on rating gaps; expected margin exists to express a gap to a person.

`beta = 0.2552`, CI `[0.096, 0.424]`, fitted on 29 matches. Recorded in code beside the value, with a pointer to `docs/research/score-aware-margin-calibration.md`.

### 6. Show a band, not a scoreline

The CI on `beta` spans a factor of 4.4, and the readout would be consumed by people mid-session deciding whether to swap two players. A specific predicted scoreline would be read as a forecast the data does not support.

Show a short qualitative band — an approximate margin with hedged wording — derived from the expected margin. Under an unknown format there is no readout at all, rather than a fabricated one. The manual-swap controls stay exactly as they are; this only informs them.

## Risks / Trade-offs

- **[Risk] This is the core matchmaking path** → keep `balanceTeams()` untouched, add the wider search around it, and hold the existing `generateRound` tests as the regression contract for fairness ordering and rest lists.
- **[Risk] Strict optimization would bench the rating extremes** → the tolerance and random tiebreak in decision 3 exist for this; it needs an explicit test over repeated rounds, not just a single-round assertion.
- **[Risk] Better balance makes matches feel repetitive** → the same tolerance mitigates it, but this is a felt quality that only real sessions can judge; worth revisiting after use rather than tuning blind.
- **[Risk] A readout invites treating `beta` as precise** → hedged presentation, no scoreline, no win probability, and the CI recorded next to the constant.
- **[Risk] `beta` was fitted on 29 matches under one format** → it affects display only; selection is unaffected by its value, so a wrong `beta` cannot corrupt matchmaking.
- **[Trade-off] Enumeration cost** → bounded, with an explicit fallback rather than a silent cap.

## Migration Plan

1. Add the fairness-key partition and boundary-group identification to `matchmaking.ts` behind existing tests, with no behaviour change yet.
2. Add the joint search with tolerance and random tiebreak; assert fairness ordering, rest lists, and seeded reproducibility are unchanged.
3. Add the bound and the fallback path, with a test that a pathological roster still returns a proposal.
4. Add `expected-margin.ts` and its tests, including monotonicity and the unknown-format absence.
5. Add the preview readout and its unknown-format absence.
6. Verify: `pnpm test`, `pnpm build`, `git diff --check`, strict OpenSpec validation, and a real session's worth of proposals inspected for variety.

No data migration. No stored shape changes. Reverting the change restores the previous proposals exactly, because nothing it produces is persisted beyond the match record itself, which is unchanged.

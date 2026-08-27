## Context

See `proposal.md` for motivation and `specs/scoring-format-snapshots/spec.md` for the normative contract.

Current `main`: `Session` and `Match` carry no format fields. `startMatch()` promotes a `RoundProposal` with no format. `submitScore()` accepts any unequal nonnegative integer pair and immediately calls winner-only Glicko. `loadData()` does `JSON.parse(raw) as AppData` inside a `try` whose `catch` returns an empty dataset. CSV has five sections — `[players]`, `[overrides]`, `[baselines]`, `[sessions]`, `[matches]` — with fixed headers and no format columns.

An earlier version of this capability exists on `feat/initial-skill-levels`. That branch also carried a J1 shadow rating runtime and an offline research platform; neither is being ported. The design below is the branch's schema and validation decisions, re-fitted to the session-boundary replay and player-archiving model that `main` gained afterwards.

## Goals / Non-Goals

**Goals**

- One exact versioned snapshot boundary shared by session defaults, live matches, completed matches, persistence, CSV, and UI.
- Freeze a match's format before any outcome exists, with no alias back to a later-editable session default.
- Validate rules and endpoints deterministically and symmetrically.
- Normalize genuinely absent legacy metadata to explicit unknown while rejecting malformed declared metadata.
- Make local upgrade fail closed instead of overwriting recoverable data.
- Prove rating results are byte-identical across format variants with the same winner.

**Non-Goals**

See `proposal.md`. In particular: no backfill, no matchmaking or rating change, no completed-format correction, no replay-boundary change.

## Decisions

### 1. One exact discriminated snapshot type in a pure module

Add `src/lib/scoring-format.ts` owning schema, catalog, constructors, validation, endpoint legality, canonical serialization, and display labels. `src/types.ts` imports only the public type.

Schema version 1 has three exact variants: `catalog` (`schemaVersion`, `kind`, `formatId`, `formatVersion`, copied `rules`), `custom` (`schemaVersion`, `kind`, trimmed 1–40 code-point `label`, copied `rules`), and `unknown` (`schemaVersion`, `kind`, `reason`).

Validators check exact own-key sets and exact primitive types. Booleans, numeric strings, prototype-bearing objects, extra fields, and mixed variants fail. Constructors build a fresh rules object, freeze it, then freeze the enclosing snapshot; every persistence and import boundary reconstructs rather than trusting a cast, so runtime immutability backs the TypeScript `readonly`.

Initial catalog, both format version 1:

- `badminton-21-w2-c30` → 21/2/30
- `badminton-15-w2-c21` → 15/2/21

Catalog snapshots persist the copied rules **and** identity/version; on read the rules must match the named version exactly. A future catalog revision gets a new version and never rebinds history.

**Alternative considered:** store only `target/winBy/cap`. Rejected — equal tuples can have different provenance, and a later catalog edit would silently reinterpret history.

**Alternative considered:** store only the catalog id and look rules up at read time. Rejected for the same reason, more directly.

### 2. Freeze format in a live-match context, not in the matchmaking output

`RoundProposal` stays a matchmaking-only value. Add a pending/live context type pairing a round with a detached snapshot. `startMatch()` freezes the selected snapshot before any score can exist. `ScoreInput` and `MatchDisplay` render it read-only.

**Alternative considered:** select the format in the score modal. Rejected — outcome-aware format selection destroys prospective provenance, which is the entire point of the change.

**Alternative considered:** add format fields to `RoundProposal`. Rejected — it would put data authority into the matchmaking contract.

### 3. Validate upstream of every effect, including replay

A pure validator takes a reconstructed snapshot and two scores. Structured variants apply the three disjoint branches from the spec; unknown preserves today's generic check and reports structured eligibility unavailable.

`submitScore()` validates before constructing the `Match`, before `applyMatch`, and before persistence. `editMatchScore()` validates against the match's existing snapshot **before** the session-boundary replay runs.

This is the main difference from the branch version. `main` replays a session from its fixed opening snapshot rather than always calling `recalcAll`, so format validation must sit strictly upstream of that decision: it may reject an edit, but it must never influence which events replay or where the boundary is. Tests assert that a rejected edit leaves rating state bit-identical, and that an accepted edit produces exactly the states the current code produces.

`src/lib/glicko2.ts` is not modified.

**Alternative considered:** accept illegal known endpoints and flag them later. Rejected — a known versioned format should prevent internally contradictory records at the authority boundary.

### 4. Normalize local data before it becomes reactive or writable

Replace `JSON.parse(...) as AppData` plus catch-and-empty with an exact normalization boundary, layered onto the existing `migrateAppData`.

Absent format properties on otherwise valid legacy sessions and matches become freshly constructed `legacy-missing` snapshots. Declared snapshots are reconstructed and validated; malformed declared values are errors, never legacy absence. Completed catalog/custom records are additionally checked against their stored endpoint.

Keep `badminton-matcher:v1` as the active key. Before the first enriched write, copy the raw value once to `badminton-matcher:pre-scoring-format-v1`. The backup is idempotent, never overwritten, and must read back byte-for-byte; a `setItem` failure or mismatch blocks any enriched write. A fresh install with no active key needs no backup.

The store gains a small recovery state: `ready`, or `blocked` carrying the preserved raw value and the validation error. While blocked, the deep watcher is gated off and mutating commands are unavailable. Recovery offers exactly three actions: download the preserved raw JSON, import a valid CSV replacement, or explicitly discard after destructive confirmation.

`persistenceError` keeps its current meaning — a write failed after a successful load — and is deliberately not merged into recovery state. The two failures need different user actions: one says "free up space and retry", the other says "your stored data could not be read and has been preserved".

**Alternative considered:** bump to a `:v2` key. Rejected — rolling the app back would hide every match created under the new key.

**Alternative considered:** keep catch-and-empty. Rejected — this is the current data-loss path: an empty dataset becomes reactive, the deep watcher fires, and the user's real data is overwritten.

### 5. One canonical JSON column per section in CSV

Add `defaultScoringFormat` to `[sessions]` and `scoringFormat` to `[matches]`. Each cell holds a canonical compact JSON object with fixed field order, escaped by the existing writer — the same approach `main` already uses for `openingRatings`, so this introduces no new encoding style.

Before row decoding, known section names and headers must be unique and each known-section row must match its header width. Duplicate headers, surplus cells, and missing cells are corruption, not legacy absence. Unknown sections stay ignorable for forward compatibility.

Bound imports to what localStorage can plausibly hold: 5 MiB UTF-8, 50,000 records, 64 KiB per decoded field. The file picker checks `File.size`; the text entry point enforces all three independently so programmatic and recovery paths cannot bypass the UI gate.

Absent column → `legacy-missing`. Present and nonempty → parse and exact reconstruction must succeed, or the whole import is rejected before `data` is assigned.

**Alternative considered:** one column per union field. Rejected — sparse cross-column combinations are easy to make contradictory and hard to evolve atomically.

### 6. Keep UI additions compact and explicit

- `SessionView.vue`: require a choice when creating a session; expose a prospective default selector for the active session; show a one-time blocking choice for a `legacy-missing` active session before its next match.
- `PreviewView.vue`: show the inherited format, allow a pre-start override or reset to the current default.
- `MatchDisplay.vue`, `ScoreInput.vue`: show the frozen format, never an editor.
- `HistoryView.vue`: show completed provenance next to the existing per-match rating delta.
- App shell: a blocking recovery screen when normalization fails.

Unknown is a real choice, not an error state, and the selector must not silently preselect a catalog entry for legacy users. The picker edits a draft; Save validates all fields together and constructs a detached snapshot, Cancel discards it. No partial custom value reaches store state.

Blocking states use normal document flow rather than a custom modal, move focus to the blocking heading, disable background actions, and cannot be dismissed with Escape. Fields carry programmatic labels, inline errors use `aria-describedby` with an `aria-live` summary, and destructive discard uses the native confirmation.

### 7. Treat completed-format correction as a future capability

No format-edit command is added. A wrong completed format stays visible and immutable. Correction would need audit records, replay effects, mutable/sealed boundaries, and CSV implications — its own change, not a field editor smuggled in here.

## Risks / Trade-offs

- **[Risk] Requiring an explicit choice adds setup friction** → offer a clearly explained explicit-unknown option and retain the choice for the whole session.
- **[Risk] All existing history stays unknown even though the owner knows it was 15/2/21** → accepted deliberately. A recorded guess is indistinguishable from a recorded fact once written, and the calibration study already documents the assumption separately in `docs/research/`.
- **[Risk] Custom formats can be mistaken for modeled formats** → label them custom everywhere and assign no catalog identity.
- **[Risk] Additive local migration could overwrite malformed source data** → normalize completely first, preserve a one-time raw backup, suspend writes on failure.
- **[Risk] CSV JSON cells are less spreadsheet-friendly** → keep them canonical and atomic; the other match columns stay readable and this matches the existing `openingRatings` treatment.
- **[Risk] Format validation could accidentally change replay** → validation is strictly upstream and side-effect free; regression tests assert rating states are unchanged for both accepted and rejected edits.
- **[Risk] Catalog constants read as scientific authorization** → catalog support means endpoint validation only; the spec and UI say nothing about model eligibility.

## Migration Plan

1. Add the pure module with schema, catalog, validation, and endpoint tests. No store wiring.
2. Extend `Session`, live context, and `Match` types; normalize legacy fixtures to explicit unknown.
3. Add guarded local load, verified one-time backup, blocked recovery state, raw download, and confirmed discard, with persistence suspended on failure.
4. Add CSV structure checks, format columns, and mixed legacy/explicit round-trip tests; wire valid-CSV recovery to the blocked lifecycle.
5. Add session default and pre-start selection UI; add read-only live and history display.
6. Gate `submitScore()` and `editMatchScore()` upstream of all effects; run rating non-interference and replay-boundary regression tests.
7. Verify `pnpm test`, `pnpm build`, `git diff --check`, strict OpenSpec validation, and the browser walkthrough.

Downgrade after snapshot-bearing data exists is lossy. An older build can read the additive JSON and ignore format fields, but any write it makes creates matches without snapshots and any CSV it exports strips the format columns; those become `legacy-missing` on re-upgrade and their provenance is not recoverable. The pre-format backup key is left untouched. No rating-state rollback is involved.

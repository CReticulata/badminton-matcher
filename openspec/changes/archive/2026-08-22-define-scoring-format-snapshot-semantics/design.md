## Context

See `proposal.md` for motivation and `specs/scoring-format-snapshots/spec.md` for the normative contract.

The current `Session` and `Match` types contain no scoring-format fields. `startMatch()` carries only a `RoundProposal`; `submitScore()` accepts any unequal nonnegative integer pair, stores it, and immediately calls winner-only Glicko. Browser persistence casts JSON from `badminton-matcher:v1` without structural validation, and CSV has fixed session/match columns with no format provenance. Existing J1 shadow preparation is score-free and diagnostics-only.

This is a cross-cutting browser-data change, but it must remain independent from score-aware rating research. The implementation must also preserve a shared dirty worktree whose current `src/store.ts`, `package.json`, and lockfile changes predate this change.

## Goals / Non-Goals

**Goals:**

- Add one exact, versioned TypeScript snapshot boundary shared by session defaults, live matches, completed matches, persistence, CSV, and UI.
- Freeze match format before outcome entry, with no object alias back to a later-editable session default.
- Validate catalog/custom rules and endpoints deterministically and symmetrically.
- Normalize truly absent legacy metadata to explicit unknown while rejecting malformed explicit metadata.
- Make local-data upgrade and CSV replacement fail closed without overwriting recoverable data.
- Prove that accepted-match rating and matchmaking authority remains winner-only Glicko.

**Non-Goals:**

- Implement a score-aware likelihood, research runner, J1/PAR adaptation, simulation, or shadow promotion.
- Add format correction for completed matches, audit logs, mutable-tail replay, sealed-history migration, or IndexedDB.
- Change Glicko, matchmaking priorities, initial ratings, score command authority, or player-visible rating output.
- Infer a format for any legacy match or retroactively validate old scores against a later catalog.

## Decisions

### 1. Use one exact discriminated snapshot type

Add a pure browser-safe module, `src/lib/scoring-format.ts`, which owns the schema, catalog, constructors, validation, endpoint legality, display labels, canonical serialization, and legacy normalization helpers. `src/types.ts` imports only its public type.

Schema version 1 has three exact variants:

- `catalog`: `schemaVersion`, `kind`, stable `formatId`, `formatVersion`, and copied `rules`;
- `custom`: `schemaVersion`, `kind`, a trimmed label of 1–40 Unicode code points, and copied `rules`;
- `unknown`: `schemaVersion`, `kind`, and reason `explicit-unknown` or `legacy-missing`, with no rule fields.

Rules are `{ target, winBy, cap }` using positive safe integers with `winBy <= target <= cap`. Validators use exact own-field sets and exact primitive types; booleans, numeric strings, dynamic aliases, unknown fields, and mixed variants fail. Custom labels are trimmed but otherwise retain exact Unicode identity; format eligibility never keys on label text. Constructors and reconstructors create a new rules object, deep-freeze it, then freeze the enclosing snapshot. Every persistence/import boundary reconstructs rather than trusting a TypeScript cast, so TypeScript `readonly` is reinforced by runtime immutability compatible with Vue's handling of non-extensible objects.

The initial catalog is intentionally small and versioned:

- `badminton-21-w2-c30`, format version 1: `21/2/30`;
- `badminton-15-w2-c21`, format version 1: `15/2/21`.

Catalog snapshots persist the copied rules as well as identity/version. On read, those rules must match the named version exactly. A future catalog revision receives a new version and never rebinds historical snapshots.

**Alternative considered:** store only `target/winBy/cap`. Rejected because equal rule tuples can have different provenance or future model eligibility, and a later catalog edit could silently reinterpret history.

**Alternative considered:** store only catalog ID and look rules up dynamically. Rejected because historical endpoints would then change meaning when catalog code changes.

### 2. Freeze format in a live-match context, not in matchmaking output

`RoundProposal` remains a matchmaking-only value. Add separate pending/live match context types that pair a round with a detached snapshot. Session setup requires an explicit catalog/custom/unknown choice. The pre-start preview defaults to a detached copy of the session default and permits an override before `startMatch()`.

`startMatch()` freezes the selected snapshot into the live context before J1 preparation and before any score exists. `ScoreInput` and `MatchDisplay` show that snapshot read-only. Changing a session default replaces only the session value and prospective pending selection; it cannot mutate a pending override, live snapshot, or completed match.

**Alternative considered:** choose or override format in the score modal. Rejected because outcome-aware format selection would corrupt prospective provenance and future research eligibility.

**Alternative considered:** add format fields to `RoundProposal`. Rejected because it would contaminate the matchmaking contract with unrelated data authority.

### 3. Keep endpoint validation pure and upstream of all effects

A pure validator receives a reconstructed snapshot plus two scores. For structured variants it applies the disjoint terminal branches from the spec: target first (also when `cap == target`), then above-target/below-cap, then cap only when `cap > target`. For unknown it preserves the existing `Number.isInteger`-compatible unequal, nonnegative checks and returns structured eligibility unavailable; this change does not tighten unknown scores to safe integers.

`submitScore()` validates before constructing/pushing `Match`, before `applyMatch`, and before J1 outcome delivery. `editMatchScore()` validates against the existing immutable match snapshot before mutation/recalculation. No completed-format editing API is added.

`applyMatch()` and `src/lib/glicko2.ts` remain unchanged and receive the same participant/score projection. The shadow request contract remains unchanged; format metadata does not create a new shadow capability. Focused non-interference tests compare accepted matches with equivalent winners across format variants and assert identical official Glicko results.

**Alternative considered:** let persistence accept illegal known endpoints and mark them unavailable later. Rejected because a known versioned format should prevent internally contradictory new records at the score authority boundary.

### 4. Normalize browser data before making it reactive or writable

Replace raw `JSON.parse(...) as AppData` with an exact normalization boundary. Missing format properties on otherwise valid legacy sessions/matches become freshly constructed `legacy-missing` unknown snapshots. Present explicit snapshots are reconstructed and validated; malformed explicit values are errors, never legacy absence. Completed catalog/custom records are also checked against their stored endpoint during complete normalization; an illegal endpoint rejects the enclosing local load or CSV restore, while legacy unknown records retain their generic historical semantics.

Keep `badminton-matcher:v1` as the active storage key for additive compatibility. If that active key exists, before the first enriched write copy its raw value once to `badminton-matcher:pre-scoring-format-v1`. Backup is idempotent: an existing backup is never overwritten; a newly written backup must be read back byte-for-byte. `setItem` failure, missing readback, or mismatch enters blocked recovery and forbids any enriched active-key write. A brand-new installation with no active key needs no backup. Only after complete normalization and any required backup verification succeed may the reactive store start and persistence writes be enabled.

The store owns a small recovery state machine: `ready`, or `blocked` with the preserved raw value and validation error. In `blocked`, the deep watcher is gated off and all mutating product commands remain unavailable. The app shell offers only three recovery actions: download the preserved raw JSON, import a valid CSV replacement, or explicitly discard and start empty after destructive confirmation. A valid import is fully parsed and normalized, atomically written to the active key, assigned to reactive data, and only then transitions to `ready` and enables persistence. Failed import, cancelled recovery, or cancelled discard leaves the raw value, in-memory data, and blocked state unchanged. Discard also preserves the one-time backup before replacing the active key.

An older application version can still read the additive JSON objects and ignore format fields. Matches created after a code rollback may omit snapshots; re-upgrade will classify only those absent values as legacy unknown.

**Alternative considered:** move directly to a v2 key. Rejected because rolling application code back would hide all matches created only under that key.

**Alternative considered:** retain the current catch-and-empty fallback. Rejected because the deep persistence watcher could overwrite recoverable malformed data with an empty dataset.

### 5. Encode each snapshot as canonical JSON inside one CSV column

Add `defaultScoringFormat` to the session section and `scoringFormat` to the match section. Each cell contains a canonical compact JSON object emitted in fixed field order and escaped by the existing CSV writer. This keeps the discriminated snapshot atomic and avoids invalid cross-column combinations. Before row decoding, known sections and their header names must be unique and each known-section row must have exactly the header width; duplicate format headers, surplus cells, and missing cells are ambiguous corruption rather than legacy absence. Unknown sections remain ignorable for forward compatibility.

Bound import to the scale that browser localStorage can plausibly retain: at most 5 MiB of UTF-8, 50,000 CSV records, and 64 KiB per decoded field. File-selection UI checks `File.size` before calling `.text()`. The text/parser entry point independently enforces UTF-8 size, record, and field limits so programmatic and recovery paths cannot bypass the UI gate; scanning aborts as soon as a record or field budget is crossed. Every over-limit path leaves storage, reactive data, and recovery state unchanged.

If the column is absent, normalization creates `legacy-missing` unknown. If the column exists and is nonempty, JSON parse plus exact reconstruction must succeed. Empty, partial, extra-field, unsupported-schema, contradictory, or malformed explicit values reject the whole import before `data` assignment. Export/import tests cover mixed catalog/custom/unknown/legacy fixtures and quoted custom labels.

**Alternative considered:** one CSV column per union field. Rejected because sparse cross-column combinations are easier to make contradictory and harder to evolve atomically.

### 6. Keep UI additions compact and explicit

- `SessionView.vue`: require a format choice while creating a session; expose a prospective default selector for the active session. A migrated `legacy-missing` active session shows a one-time blocking choice before its next match; cancel leaves it blocked, and choosing Unknown stores `explicit-unknown` so the choice is distinguishable from migration provenance.
- `PreviewView.vue`: show the inherited format and permit a pre-start override or reset to the current default.
- `MatchDisplay.vue` and `ScoreInput.vue`: show the frozen live format, never an editor.
- `HistoryView.vue`: display the completed catalog/custom/unknown provenance; score editing uses the frozen rules.
- App-level recovery surface: when local normalization fails, explain that stored data was preserved and require explicit recovery/import action before writes resume.

Unknown is a real explicit choice, not an error or hidden fallback. The selector must not silently preselect a catalog entry for legacy users.

The reusable picker edits a draft rather than a live snapshot. Custom mode shows label, target, win-by, and cap fields; Save validates all fields together and constructs a detached snapshot, while Cancel discards the draft and preserves the previous selection. Session-default Save replaces only the prospective default. Preview override Save replaces only the pending match selection, and “Use session default” restores a fresh copy of the current default. No partial custom value reaches store state.

Blocking states use normal document flow rather than a custom modal. Storage recovery replaces the app's mutable content with one top-level recovery screen; legacy format choice replaces the next-match controls in `SessionView`. On entry, focus moves to the recovery heading or first format control; background product actions are absent/disabled; Escape cannot dismiss the block. Every field has a programmatic label, inline errors use `aria-describedby` and an `aria-live` summary, Save focuses the first invalid field, and cancelled sub-actions restore focus to their trigger. Destructive discard uses the browser-native confirmation. At 320 CSS pixels the controls use one column with no horizontal scroll, and all primary touch targets are at least 44 by 44 CSS pixels.

### 7. Treat completed-format correction as a future capability

This change deliberately adds no format-edit command. A wrong completed format remains visible but immutable. Supporting correction later would need audit records, replay effects, mutable/sealed boundaries, CSV implications, and potentially rating-observation semantics. Those decisions require their own OpenSpec change and cannot be smuggled into a simple field editor.

## Risks / Trade-offs

- **[Risk] Requiring an explicit session choice adds setup friction** → Include a clearly explained explicit unknown option and retain the selection for prospective matches in that session.
- **[Risk] A custom format can be mistaken for a modeled format** → Label it custom everywhere, omit catalog identity, and keep future score-aware eligibility unavailable until a later protocol names it explicitly.
- **[Risk] Additive local migration could overwrite malformed source data** → Normalize completely first, preserve a one-time raw backup, and suspend writes on failure.
- **[Risk] CSV JSON cells are less spreadsheet-friendly** → Keep them canonical and atomic; display/import tooling remains the supported editing surface, while other match columns stay readable.
- **[Risk] Current broad full-recalculation score edits predate the planned sealed-tail semantics** → This change validates score edits against the frozen format but does not claim to implement the future mutable-tail architecture.
- **[Risk] Catalog constants become accidental scientific authorization** → Catalog support means endpoint validation only. Specs and UI state explicitly separate it from PAR eligibility, inference, safety, protocol advancement, and production promotion.
- **[Risk] Shared dirty runtime files obscure attribution** → Apply must capture pre-edit status and hashes for every target, patch minimally, and report only owned changes.

## Migration Plan

1. Add pure schema/catalog/normalization tests and implementation without connecting store writes.
2. Extend `Session`, live context, and `Match` types; normalize legacy fixtures to explicit unknown.
3. Add guarded local-load migration, verified one-time backup, blocked recovery state, raw download, and confirmed discard; keep persistence suspended on malformed explicit data or backup failure.
4. Add strict CSV structure, format columns, atomic mixed-version import/round-trip tests, then connect valid-CSV recovery to the already-blocked store lifecycle.
5. Add session/pre-start selection and read-only live/history display.
6. Gate score submission/editing before all effects, then run focused Glicko/shadow non-interference tests.
7. Verify typecheck, focused Vitest, production build, strict OpenSpec validation, and tracked/untracked whitespace checks.

Full-fidelity downgrade after snapshot-bearing data exists is unsupported. Before running an older build, preserve the enriched active raw JSON and a new-format CSV backup outside that build. The previous app can consume known JSON/CSV fields, but any old-version write may create matches without snapshots and any old-version CSV export strips format columns; those missing values become legacy unknown on re-upgrade and cannot recover prior provenance. This is an explicit lossy downgrade boundary, not a reversible migration guarantee. The pre-format local backup remains untouched. No rating-state rollback or IndexedDB operation is involved.

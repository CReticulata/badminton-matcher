## 1. Pure scoring-format module

- [x] 1.1 RED: add `src/lib/__tests__/scoring-format.test.ts` covering exact variant identity, exact own-key sets, rejection of extra/missing/wrong-typed fields, `winBy <= target <= cap`, safe-integer rules, 1–40 code-point custom labels, the three disjoint endpoint branches including `cap == target`, team-exchange symmetry, canonical serialization round-trip, and runtime immutability of returned snapshots.
- [x] 1.2 GREEN: implement `src/lib/scoring-format.ts` with schema, catalog (`badminton-21-w2-c30`, `badminton-15-w2-c21`), constructors, `reconstructScoringFormat`, `isLegalEndpoint`, canonical encode, and display labels. No store, Vue, or DOM import.
- [x] 1.3 Run the focused test file and record the real result.

## 2. Types and legacy normalization

- [x] 2.1 RED: add `src/lib/__tests__/app-data-normalization.test.ts` covering absent format fields → `legacy-missing`, declared-but-malformed → throw, structurally valid snapshot contradicting its stored endpoint → throw, and a legacy score legal under exactly one catalog entry staying unknown.
- [x] 2.2 GREEN: add `Session.defaultScoringFormat` and `Match.scoringFormat` to `src/types.ts`; add `src/lib/app-data-normalization.ts` layered onto the existing `migrateAppData`.
- [x] 2.3 Prove normalization preserves every existing field: `openingRatings`, `participantOrderReliable`, `addedDuringSessionIds`, `archivedAt`, overrides, and baselines.

## 3. Blocking recovery on local load

- [x] 3.1 RED: extend `src/store.test.ts` for normalize-or-block — malformed local value preserved unchanged, deep watcher does not write, mutating commands unavailable, and `persistenceError` unchanged and distinct from recovery state.
- [x] 3.2 RED: add tests for the one-time `badminton-matcher:pre-scoring-format-v1` backup — idempotent, never overwritten, byte-for-byte readback required, write failure blocks the enriched write, fresh install needs no backup.
- [x] 3.3 GREEN: replace `loadData()`'s catch-and-empty with the normalization boundary and recovery state in `src/store.ts`; gate the deep watcher while blocked.
- [x] 3.6 GREEN: gate every data-mutating store command behind the blocked state, not only the interface; add tests covering each command and the recovery actions' exemption.
- [x] 3.4 GREEN: add `src/components/RecoveryView.vue` with exactly three actions — download preserved raw JSON, import valid CSV, explicit discard after native confirmation — and wire it into `src/App.vue`.
- [x] 3.5 Add tests for cancelled/failed recovery leaving raw value, in-memory data, and blocked state unchanged.

## 4. CSV round-trip

- [x] 4.1 RED: extend `src/lib/__tests__/csv.test.ts` for `defaultScoringFormat` in `[sessions]` and `scoringFormat` in `[matches]`, mixed legacy/catalog/custom/unknown fixtures, quoted custom labels, catalog rules not rebinding to a newer definition, and full preservation of existing columns.
- [x] 4.2 RED: add structure-corruption tests — duplicate known section, duplicate header, row width mismatch — rejecting the whole import before decoding.
- [x] 4.3 RED: add budget tests — 5 MiB UTF-8, 50,000 records, 64 KiB per decoded field — rejecting at the earliest boundary and leaving storage, reactive data, and recovery state unchanged.
- [x] 4.4 GREEN: implement the columns and checks in `src/lib/csv.ts` using the existing canonical-JSON-in-one-cell approach already used by `openingRatings`.

## 5. Selection and display UI

- [x] 5.1 GREEN: add `src/components/ScoringFormatPicker.vue` editing a draft; Save validates all fields together and constructs a detached snapshot, Cancel discards it, no partial custom value reaches store state.
- [x] 5.2 GREEN: `src/components/SessionView.vue` — pre-fill the fixed product default at session creation with a collapsed change control, expose a prospective default selector, and show the one-time blocking choice for a `legacy-missing` active session before its next match.
- [x] 5.3 GREEN: `src/components/PreviewView.vue` — show the inherited format, allow a pre-start override and "use session default".
- [x] 5.4 GREEN: read-only display in `src/components/MatchDisplay.vue`, `src/components/ScoreInput.vue`, and `src/components/HistoryView.vue`.
- [ ] 5.5 Verify blocking states: focus moves to the blocking heading, background actions disabled, Escape cannot dismiss, labels and `aria-describedby`/`aria-live` present, 44×44 CSS pixel touch targets, single column with no horizontal scroll at 320 CSS pixels.

## 6. Gate score entry and editing

- [x] 6.1 RED: add store tests — illegal endpoint under a catalog/custom snapshot rejected before match persistence and before any rating mutation; unknown snapshot keeps today's generic validation.
- [x] 6.2 RED: add tests proving two accepted matches with different valid snapshots but the same participants and winner produce identical `rating`, `rd`, and `vol`.
- [x] 6.3 RED: add replay-boundary regression tests — a rejected history edit leaves rating state bit-identical; an accepted edit produces exactly the states current `main` produces, still replaying from the session opening snapshot and still not crossing into the next session.
- [x] 6.4 GREEN: freeze the snapshot in `startMatch()`; validate in `submitScore()` upstream of `applyMatch` and persistence; validate in `editMatchScore()` upstream of the replay decision.
- [x] 6.5 Add tests that archiving and restoring a player changes no snapshot and that archived players' matches export unchanged.

## 8. Unrated force-record

- [x] 8.1 Add `Match.excludedFromRating` and a single `countsForRating()` predicate in `src/lib/glicko2.ts`; make `replayRatings` skip excluded matches so no call site can miss it.
- [x] 8.2 Skip excluded matches in the live update (`submitScore`) and in `sessionRatingReport` per-match deltas.
- [x] 8.3 Relax the endpoint-contradiction rejection in `normalizeAppData` for matches carrying the explicit flag; without the flag it stays corruption.
- [x] 8.4 Add the `excludedFromRating` CSV column and round-trip tests.
- [x] 8.5 Offer the force control only after the illegal-endpoint message, in `ScoreInput.vue` and the `HistoryView.vue` edit flow.
- [x] 8.6 Add tests for rating non-contribution under live update, `recalcAll`, and session summary; fairness statistics still counting; force not bypassing tie/negative; reload/CSV round-trip; and the edit invariant in both directions.

## 7. Verify

- [x] 7.1 Run `pnpm test` and record the real file/test counts.
- [x] 7.2 Run `pnpm build` and confirm `vue-tsc -b` and the Vite build both exit zero.
- [x] 7.3 Run `git diff --check`.
- [x] 7.4 Run `openspec validate port-scoring-format-snapshots --strict --no-interactive`.
- [ ] 7.5 Browser walkthrough on `pnpm dev`: create a session with each variant → play and record a match under a catalog format → attempt an illegal endpoint and confirm rejection → edit that score in history and confirm the rating delta updates within the session only → import a legacy CSV without format columns and confirm every match shows unknown → corrupt the local value by hand and confirm the recovery screen preserves it.
- [x] 7.6 Confirm the non-goals hold: no backfill of existing matches, no matchmaking or `expectedMargin` change, no edit path for completed formats, no change to `src/lib/glicko2.ts`.

## 執行紀錄

- `pnpm test`：18 files / 193 tests passed。
- `pnpm build`：`vue-tsc -b` 與 Vite production build 皆 exit 0。
- `git diff --check`：exit 0。
- `openspec validate port-scoring-format-snapshots --strict --no-interactive`：valid。
- 以實際匯出的 29 場 CSV 驗證：匯入後 14 球員／2 活動／29 場全數保留，全部為
  `legacy-missing`（無回填），`openingRatings` 與 `participantOrderReliable` 保留，
  export → import → 再比對完全相等。自訂賽制名稱含雙引號、逗號、換行、空白、emoji
  皆可 round-trip。
- 非目標核對：`src/lib/glicko2.ts`、`src/lib/matchmaking.ts`、`src/lib/rating-history.ts`、
  `src/lib/migration.ts` 均未修改；`src/` 內無 `expectedMargin` 或任何已完成賽制的編輯入口；
  既有比賽一律 `legacy-missing`，未回填任何目錄賽制。

### 尚未完成

- 5.5 與 7.5 需要真實瀏覽器操作，未執行。程式已寫入對應屬性（復原標題 `tabindex="-1"`
  並於 `onMounted` 取得焦點、封鎖期間隱藏分頁列與覆蓋層、主要按鈕 `min-h-11`、
  錯誤訊息 `role="alert"`／`aria-live`、破壞性捨棄使用瀏覽器原生確認），
  但焦點順序、320 CSS 像素單欄呈現與完整走查尚未由人實際確認。

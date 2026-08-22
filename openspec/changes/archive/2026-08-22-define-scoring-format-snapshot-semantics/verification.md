# Verification Receipt

## Scope and authority

- Change: `define-scoring-format-snapshot-semantics`
- Branch: `feat/initial-skill-levels`
- Implementation base / verified merge-base: `7faaa0355e48ea8891acad2d48ee02b42fffb5aa`
- Product remains a browser-only Vue/TypeScript PWA using localStorage and CSV.
- Glicko remains the sole production rating and matchmaking authority.
- No backend, Python service, IndexedDB, Electron bridge, score-aware authority, simulation, promotion, migration, or cutover was added or run.

## TDD and review evidence

- Match lifecycle RED: `/tmp/badminton-scoring-format-apply/5.3-red.log`
- Complete real-Chromium UI RED: `/tmp/badminton-scoring-format-apply/6.2-host-complete-red.log`
- Review-finding Node RED: SHA-256 `00e099867dbcb8c937b0c683b99a5a3031ba9675dbabc71057220d8ba80691e9`
- Review-finding Chromium RED: SHA-256 `dcabe692b8881bc5c34fd83fdce1a06d49cfce3ae02dc399ddaa372784ae6852`
- Review-finding focused Node GREEN: 3 files / 28 tests, SHA-256 `d2a9f9f3506f32396a77c665d5cf5b98e1343e8b400bb35355361e8ae5d8647b`
- Deterministic race focused Chromium GREEN: 1 passed, SHA-256 `2022294523788d5007004c1b3cde9c34b74d71584ec4826bdca9b343a722cf90`

## Final gates

- `npm exec --yes --package=pnpm@11.22.0 -- pnpm test`
  - 19 files / 112 tests passed
  - SHA-256 `0ca499db9fe2ce5243902fcc536b1bfa3a54f7fc5cc737a5cc457be64ec2f7b3`
- `npm exec --yes --package=pnpm@11.22.0 -- pnpm exec vitest --config vitest.browser.config.ts run --reporter=verbose`
  - Vitest Browser Mode, Playwright Chromium
  - 2 files / 11 tests passed / 0 skips
  - SHA-256 `23c74a595bd90910f4918154384dac3aaa99a5de0540798a2d36710a17818875`
- `npm exec --yes --package=pnpm@11.22.0 -- pnpm exec vue-tsc --noEmit --pretty false`
  - exit 0
- `npm exec --yes --package=pnpm@11.22.0 -- pnpm build`
  - exit 0; production assets emitted
  - SHA-256 `3c9e599b1212dd8bf280f37d07cdd5b18d1df48f033a3f1ecbab866734cb208e`
- `openspec validate --all --strict --no-interactive`
  - 3 passed / 0 failed before archive
  - SHA-256 `feaeba01a3ba4663b06ef5b1ea58dae2823b5b61fe6114952ed7bfa198671953`
- `git diff --check`
  - exit 0

## Review disposition

- Correctness and project-standards passes: no findings.
- Browser collection P2: closed with convention glob.
- Partial decoder P1: closed with explicit exact entity decoders; independent closure reviewer confirmed.
- BOM P1 claim: false positive, disproved by exact app-payload round-trip test; independent closure reviewer confirmed.
- Later persistence failure P1: closed with last-persisted blocked recovery; independent closure reviewer confirmed.
- Stale recovery P2: closed with monotonic token, stale success/error guards, and unmount invalidation; exact focused and full Chromium are GREEN.
- Cross-model peer evidence: unavailable/degraded because its environment lacked `jq`; no result was fabricated.
- Installed CE skill lacked the prescribed `finish-review.py`; schema artifacts were manually deduplicated and synthesized.

## Worktree and protected artifacts

- Shared pre-archive worktree status contained 45,043 entries; broad staging is forbidden.
- Protected apply baseline: 33,293 paths checked.
- 33,292 paths remain byte-identical.
- Sole declared exception: `src/lib/rating-j1/__tests__/shadow-browser.test.ts`, a test-only fixture updated with the now-mandatory explicit-unknown snapshot so the production Worker browser gate remains executable.
- `package.json`, `pnpm-lock.yaml`, Glicko, matchmaking, J1 shadow/Worker production implementation, research/protocol archives, and the stable score-informed roadmap remained byte-identical to the apply baseline.

## Bounded evidence labels

- Engineering evidence: `GREEN` for the commands above.
- Research outcomes for this change: `NOT_RUN`.
- Formal inference: `false`.
- Safety evaluation: `NOT_EVALUATED`.
- Protocol advancement: `false`.
- Production authorization: scoring-format provenance/persistence/UI only.

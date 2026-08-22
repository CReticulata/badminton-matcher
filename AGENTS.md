# Repository Agent Guide

## Project

`badminton-matcher` is a frontend-only Vue 3 + TypeScript + Vite PWA. Product data remains local to the browser (`localStorage` / CSV). Do not add a backend, browser Python runtime, or server-side rating service.

Read these sources before changing behavior:

- `spec.md` — legacy product baseline predating OpenSpec
- `design.md` — product and UI decisions
- `CONTEXT.md` — current domain, replay, runtime, and authority boundaries
- `docs/adr/`, `docs/features/`, and `docs/research/` — durable decisions and evidence

Glicko remains the sole production rating and matchmaking authority unless a separate, explicit promotion decision says otherwise. Research methods and shadows must remain non-authoritative.

## Mandatory OpenSpec Workflow

All future development must be recorded through OpenSpec. This includes features, fixes, refactors, behavior changes, persistence/schema changes, rating or matchmaking changes, migrations, and build/runtime configuration changes.

1. Before modifying implementation code, create or continue an OpenSpec change under `openspec/changes/`.
2. Use the repository's `spec-driven` schema and complete every artifact required by `openspec status --change <name>`: proposal, delta specs, design when required, and tasks.
3. Delta specs must state observable requirements and scenarios. They must not silently redefine the legacy `spec.md` baseline.
4. Do not begin implementation until the change is ready for apply. Implement only the tasks recorded in that change, using tests first for behavior changes.
5. Keep evidence and task status current while implementing. Record the exact verification commands and their real outcomes; never invent missing results.
6. Validate the change with `openspec validate <change-name>` before declaring it complete.
7. After implementation and verification, archive the change so accepted delta specs are synchronized into `openspec/specs/`.
8. Do not retroactively manufacture OpenSpec records for work completed before initialization. Existing documents remain historical evidence and may be referenced by new changes.

Use the repo-local OpenSpec skills (`openspec-propose`, `openspec-apply-change`, `openspec-update-change`, `openspec-archive-change`, `openspec-sync-specs`, `openspec-explore`) and the installed `openspec` CLI. Resolve paths from CLI JSON/status output rather than assuming directory layouts.

## Engineering Guardrails

- Work safely in a shared dirty worktree: inspect status first and never claim, overwrite, clean, reset, or checkout unrelated changes.
- Use strict TDD for behavior changes: capture RED, implement the smallest GREEN, then run focused and broader closure checks.
- Use `npm exec --yes --package=pnpm@11.22.0 -- pnpm ...` for package-manager commands.
- Browser Worker claims require real Chromium / Vitest Browser Mode evidence, not only Node mocks.
- Python is limited to offline research, fixtures, and reference-oracle work; production runtime is browser TypeScript.
- No formal/reserved-seed research, production migration, authority transition, or cutover without separate explicit authorization recorded in the relevant OpenSpec change.

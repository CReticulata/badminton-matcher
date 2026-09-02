# Rotation wildcard simulation runner

This directory contains development-only, deterministic evidence tooling for OpenSpec change `reduce-repeating-lineups`. It may import production pure matchmaking functions, but production `src/**` must never import this directory.

## Focused verification

```bash
npm exec --yes --package=pnpm@11.22.0 -- pnpm test:simulation
npm exec --yes --package=pnpm@11.22.0 -- pnpm simulation:smoke
npm exec --yes --package=pnpm@11.22.0 -- pnpm simulation:representative
```

## Production isolation and release authority

A production build emits Vite's manifest and then runs both the simulation-isolation guard and the rotation-wildcard release-authority guard:

```bash
npm exec --yes --package=pnpm@11.22.0 -- pnpm build
```

The isolation guard rejects `src/**` imports into `docs/research/**` and rejects simulation paths, markers, or current research-file SHA-256 digests in Vite build output. The release guard recomputes the representative report/summary digests for any future approval manifest, requires finite non-negative unique candidate bands and summary metrics with no negative-zero identity, strict boolean gate and release fields, requires every candidate to contain exactly the protocol's 29 canonical cell identities, and canonicalizes every summary-cell regression (actual repeat worsening plus positive paired appearance/rest p95, p99, and maximum deltas); the manifest disclosure list must match those stable IDs exactly. With no manifest, it requires the production band to remain exactly `0.5`, requires `ROTATION_WILDCARD_GENERATION_RELEASED` to remain false, and rejects a production bundle containing the wildcard-generation marker.

## Evidence authority

- `protocol.ts` freezes schema v2's deterministic 29-cell covering matrix (every allowed mode/count pair, with every attendance, duration, and Rating family represented), 24 rounds per scenario, the candidate bands, A/B/C/D identities, equal-cell aggregation, nearest-rank p95 contract, and a shared set of 500 fixed seeds per cell.
- `manifest.ts` generates method-independent attendance, duration, mode, and fixed Rating covariates with keyed named random streams.
- Smoke outputs are development checks only. They cannot authorize a production fairness-band change.
- A representative report can recommend a candidate only after exact paired-row and digest verification. Production still requires a separate explicit human approval manifest and release guard.

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

The isolation guard rejects `src/**` imports into `docs/research/**` and rejects simulation paths, markers, or current research-file SHA-256 digests in Vite build output. The release guard keeps three mutually exclusive states: ordinary V1 approval for a gate-passing candidate; the exact evidence-bound `0.5` risk-acceptance receipt for existing wildcard generation; or the prior no-receipt `0.5 + unreleased` fallback. It recomputes representative report/summary digests, mechanically derives risk metrics, requires finite non-negative unique candidate bands and metrics with no negative-zero identity, strict boolean fields, every candidate's exact protocol 29-cell identity set, exact approver/source, and literal adjacent-authority denials. Risk-receipt schema v2 also binds the independently pinned versioned denied-behavior source contract; source-path, category, byte-hash, or contract-digest drift fails closed.

Bundle verification validates the Vite `index.html` entry against `.vite/manifest.json`, scans only entrypoint-reachable JavaScript chunks for the release marker, and runs deterministic doubles and singles behavior probes against the actual built entry with `happy-dom`. The disposable probe blocks network APIs and requires valid persisted wildcard lineage plus exactly one replacement at the correct playing-set cardinality. Multi-chunk/module-import entry graphs are rejected clearly until a confined graph loader is implemented; the verifier never rewrites built code to manufacture a passing behavior.

## Evidence authority

- `protocol.ts` freezes schema v2's deterministic 29-cell covering matrix (every allowed mode/count pair, with every attendance, duration, and Rating family represented), 24 rounds per scenario, the candidate bands, A/B/C/D identities, equal-cell aggregation, nearest-rank p95 contract, and a shared set of 500 fixed seeds per cell.
- `manifest.ts` generates method-independent attendance, duration, mode, and fixed Rating covariates with keyed named random streams.
- Smoke outputs are development checks only. They cannot authorize a production fairness-band change.
- A representative report can recommend a candidate only after exact paired-row and digest verification. Production still requires a separate explicit human approval manifest and release guard.

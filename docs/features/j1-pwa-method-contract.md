---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-plan-bootstrap
---

# PWA-Adaptable Rating (PAR) method contract

<!-- BEGIN CURRENT SCORE-INFORMED ROADMAP STATUS -->
> [!IMPORTANT]
> ## Current status and precedence (2026-08-22)
>
> This requirements-only contract and its original nine unresolved blockers remain intact. The roadmap sequences investigation; it does not declare any blocker resolved and does not authorize implementation.
>
> - **Current runtime boundary:** [ADR 0002](../adr/0002-rating-runtime-and-j1-shadow-boundary.md) (`docs/adr/0002-rating-runtime-and-j1-shadow-boundary.md`) and the [U9 milestone](../research/j1-browser-parity-shadow-milestone-decision.md) (`docs/research/j1-browser-parity-shadow-milestone-decision.md`). Glicko remains the sole production rating and matchmaking authority.
> - **Active change status:** `reframe-score-informed-rating-roadmap` is owner-approved guidance before archive, not an already-archived controlling spec.
> - **Stable roadmap location:** `openspec/specs/score-informed-rating-roadmap/spec.md` becomes the stable roadmap spec of record only after owner acceptance and archive.
> - **Investigation order only:** simpler product-native game-level candidates may be studied before higher-complexity blockers, but every blocker below remains unresolved and retains its independent evidence and product-decision requirements.
>
> Evidence and authorization status:
>
> - Research evidence: historical or bounded; not PAR validation
> - Engineering compatibility/non-interference: bounded J1 evidence only
> - Formal inference: false
> - Safety evaluation: NOT_EVALUATED
> - Protocol advancement: false
> - Production authorization: false; Glicko remains the sole rating and matchmaking authority
> - Dense covariance: not authorized by this legacy record
> - Activity-local state: not authorized by this legacy record
> - IndexedDB migration: not authorized by this legacy record
> - Rating-authority transition: not authorized by this legacy record
>
> Scoped negative result: Phase 2A sigma/omega identification gate FAIL. See [`docs/research/activity-state-phase2a-full-findings.md`](../research/activity-state-phase2a-full-findings.md) and [`docs/research/activity-state-phase2-joint-variance-plan.md`](../research/activity-state-phase2-joint-variance-plan.md). Phase 2B and production implementation under that protocol remain blocked. Phase 1 evidence must not be pooled to overturn this result. A genuinely new PAR question requires a new identity and prospective preregistration; it is not a renamed continuation or Phase 2B advancement.
<!-- END CURRENT SCORE-INFORMED ROADMAP STATUS -->

## Goal Capsule

PAR is a provisional, separately named family for future browser-native product rating. It must not use the `J1-CT-96` name or present its fixed-history evidence as applicable to product-shaped records. Glicko remains the sole product rating and matchmaking authority. The strict eligibility preflight may describe whether an imported history fits the frozen strict contract; it neither adapts incompatible history nor creates scientific state.

Formal and safety status are not evaluated here. The 93-world evidence is nonformal and exploratory, so it cannot transfer to PAR.

## Product Contract

### Requirements

- Preserve each historical scoring-format snapshot explicitly; do not infer a format from final scores.
- Preserve actual roster and event history without silently splitting sessions, converting singles to doubles, or fabricating covariance.
- Treat strict-ineligible or custom data as outside `J1-CT-96`; the eligibility report is descriptive rather than a method label.
- Keep Glicko as the sole authority unless a separately evidenced product decision changes that boundary.

### Unresolved blockers

The following require independent product decisions and evidence before PAR can be evaluated:

- activity weighting;
- roster expansion and covariance;
- singles;
- formats and historical snapshots;
- cold start;
- sigma;
- latent-to-display scale;
- migration and rollback;
- promotion evidence.

### Promotion evidence

Any future promotion evidence must be specific to PAR and its defined product data semantics. It must not reuse the frozen strict fixture result, the `J1-CT-96` label, or the 93-world nonformal exploratory evidence as a substitute for PAR evidence.

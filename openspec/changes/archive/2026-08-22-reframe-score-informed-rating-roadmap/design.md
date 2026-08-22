## Context

See `proposal.md` for the motivation and `specs/score-informed-rating-roadmap/spec.md` for the normative roadmap contract.

The live product commits one Glicko update per completed match. `src/lib/glicko2.ts` reduces a final score to winner/loser, while `src/store.ts` persists the full score and treats the optional J1 Worker as diagnostics-only. The completed U1–U9 milestone proves bounded J1 TypeScript parity and browser-shadow non-interference, not product-shaped predictive value.

Repository planning records currently carry different scopes and dates. In particular, ADR 0001 and the score-informed decision tree describe dense covariance, IndexedDB, and activity-state choices as accepted or settled, while ADR 0002 and the U9 milestone explicitly withhold those production and migration authorities. Historical research artifacts must stay auditable, but their status cannot remain ambiguous to future implementers.

This change is documentation and governance only. It does not alter runtime code, browser data, replay, CSV, research artifacts, or authority state.

## Goals / Non-Goals

**Goals:**

- Create one roadmap contract that downstream OpenSpec changes can cite after owner acceptance, implementation, verification, and archive.
- Establish a deterministic precedence method for repository decision records without erasing their provenance.
- Separate product semantics, candidate research, shadow integration, complexity escalation, and promotion into independently authorized phases.
- Make simple game-level candidates the baseline research path and require evidence before adding activity-local or dense joint state.
- Turn negative or insufficient evidence into an explicit stop/narrow decision rather than an implicit complexity escalation.

**Non-Goals:**

- Selecting a PAR equation, likelihood, prior, sigma, display mapping, or winner-only fallback implementation.
- Modifying Glicko, matchmaking, score submission, history replay, UI, localStorage, CSV, or the J1 shadow.
- Designing or executing IndexedDB migration, production transition, rollback drills, or historical backfill.
- Running simulations, generating worlds, consuming reserved seeds, or reclassifying existing evidence.
- Silently rewriting frozen research protocols, validators, amendments, receipts, or archived outputs.

## Decisions

### 1. Use an evidence ladder rather than a model-first roadmap

Downstream work is divided into five gates:

1. **Product semantics:** define immutable scoring-format and event semantics needed by a bounded candidate. Unknown legacy data stays unknown.
2. **Candidate research:** compare current winner-only Glicko with at least one simple product-native, game-level score-aware candidate using preregistered predictive metrics and a separate direct team-balance outcome that preserves participation/rest fairness priority.
3. **Product-shaped shadow:** only a candidate with sufficient bounded evidence may enter a removable diagnostics-only browser shadow.
4. **Complexity escalation:** activity-local state, covariance, new persistence, or broader replay is proposed only to address a measured limitation.
5. **Promotion/migration:** a separate proposal, evidence package, recovery design, and owner decision are required before any authority change.

This ordering keeps product value upstream of infrastructure investment.

**Alternative considered:** continue the existing nine-blocker PAR matrix as one foundational program. Rejected because it makes activity weighting, covariance, sigma, display scale, and migration jointly prerequisite even when a simpler candidate may answer the product question without them.

### 2. Treat J1 as a bounded reference, not PAR's inherited architecture

J1 remains useful for numerical parity, deterministic fixtures, browser safety patterns, and as a possible research comparator where its frozen contract applies. PAR candidates must declare their own identity, semantics, evidence, and limitations. No candidate gains validity by sharing implementation structure with J1.

**Alternative considered:** adapt J1 incrementally until all product cases become eligible. Rejected because each adaptation changes the method family and would make the selected fixed-history evidence non-transferable while biasing the product architecture toward J1-specific assumptions.

### 3. Make game-level independent state the first complexity floor

The first candidate-research proposal must include a game-level score-aware candidate that can operate on its declared product semantics without dense covariance. This is a research baseline requirement, not a decision that the final method must remain independent.

Activity-local state or covariance can be added later only with an explicit limitation claim, incremental gate, and browser-cost envelope.

**Alternative considered:** start with dense connected-component covariance because prior research selected it as an exact reference. Rejected because exactness within a research model does not demonstrate that the model is necessary for the product outcome, and it immediately couples scientific state to IndexedDB, CSV, replay, and migration complexity.

The completed Phase 2A sigma/omega identification result is a binding negative result for its exact protocol: the frozen gate failed, Phase 2B did not advance, and Phase 1 evidence cannot be pooled to rescue it. This does not ban new PAR questions, but any successor must change and preregister its estimand or design rather than relabel the failed path.

### 4. Use explicit document precedence notices rather than destructive cleanup

The implementation phase will add a compact status/precedence notice near the top of each affected legacy document:

- its original status and evidence remain visible;
- before archive, the notice names ADR 0002 and U9 as the controlling runtime boundary and labels this change as proposed or approved guidance;
- the notice references `openspec/specs/score-informed-rating-roadmap/spec.md` as the stable roadmap location that becomes authoritative only after archive;
- it separates active product semantics from historical research decisions and unapproved infrastructure;
- frozen artifacts are linked, not edited to create a new interpretation.

ADR 0002 and the U9 milestone remain the controlling authority boundary for current runtime work. The archived OpenSpec capability becomes the roadmap contract after this change is implemented, validated, approved, and archived.

**Alternative considered:** mark all earlier documents rejected or delete obsolete sections. Rejected because some decisions remain useful research context, and deletion would damage provenance and make it harder to explain how the current boundary was reached.

### 5. Keep downstream changes small and independently authorizable

This roadmap does not create one omnibus PAR implementation change. Expected follow-up changes are separate and dependency-ordered:

- scoring-format and event semantics;
- bounded product-shaped candidate protocol;
- candidate implementation/evaluation only after protocol approval;
- shadow only after candidate evidence;
- complexity escalation only after a measured limitation;
- promotion/migration only after a separate explicit decision.

A downstream change may combine adjacent steps only when it preserves preregistration, authority, and evidence boundaries.

Candidate protocols are content-bound before relevant outcomes: candidate/comparator versions, cohort and data-snapshot identity, metric definitions, thresholds or deterministic rules, tuning boundaries, stopping rules, evidence statuses, and permitted run scope are fixed together. Amendments bind predecessors; post-outcome changes are exploratory and cannot independently advance authority.

**Alternative considered:** create all PAR tasks now to provide a complete implementation roadmap. Rejected because unresolved scientific and product decisions would turn tasks into premature commitments and encourage execution past unsupported gates.

### 6. Preserve browser and authority boundaries throughout

All production-facing runtime remains browser TypeScript. Python remains offline research/reference tooling. No future research or shadow change receives a capability that can write authoritative ratings, matchmaking, score commands, CSV/backups, or player-visible results unless a separately approved promotion change explicitly replaces this rule.

No persistence or replay design is implied by candidate research. Storage decisions follow actual state requirements and browser measurements rather than preceding them.

## Risks / Trade-offs

- **[Risk] Legacy documents remain long and can still be quoted out of context** → Add prominent current-status notices and direct links to the controlling roadmap and authority record; validate required phrases and links with a focused documentation test/script.
- **[Risk] A simple candidate underfits and delays a genuinely necessary joint model** → Keep activity-state and covariance as explicit challengers; escalation is available as soon as a measured limitation and incremental gate are documented.
- **[Risk] Glicko is both production authority and research comparator, which may privilege the incumbent** → Preregister predictive and direct team-balance metrics, cohorts, thresholds, and decision rules; report each gate, failures, and uncertainty separately and preserve participation/rest fairness priority.
- **[Risk] Separating phases creates more proposals** → Keep each proposal bounded and dependency-linked; the additional records are intentional safeguards around scientific leakage, migration, and authority.
- **[Risk] Document precedence is mistaken for retroactive invalidation** → Preserve dates, original status, evidence labels, and frozen artifacts; notices constrain current authorization rather than rewriting historical facts.
- **[Risk] Roadmap requirements become process-only and are ignored** → Archive them as an OpenSpec capability, reference them from affected records, and require every downstream rating change to declare conformance and authority effects.

## Migration Plan

This change has no product-data or runtime migration.

1. Add current-status and precedence notices to the three affected legacy planning records, naming ADR 0002/U9 as the current runtime boundary and the active change as proposed or approved guidance.
2. Add a concise roadmap section or link that identifies the five independent phases and their gates.
3. Verify that no frozen research artifact content or runtime source changed.
4. Run strict OpenSpec validation and focused documentation checks.
5. After owner acceptance, use the separate archive workflow so `openspec/specs/score-informed-rating-roadmap/spec.md` becomes the main spec; archive is not performed inside apply.

Rollback consists of reverting only the documentation notices and this change's OpenSpec artifacts before archive. After archive, any revision SHALL use a new OpenSpec change; historical archived artifacts are not edited in place.

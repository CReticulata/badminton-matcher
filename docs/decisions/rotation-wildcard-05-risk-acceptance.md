# Rotation wildcard 0.5 risk acceptance

## Decision

ArcherKuo explicitly authorized production use of the already implemented rotation wildcard while retaining the fixed fairness band at `0.5` appearances/hour. The approving source is message `1546861022458159164` (「那我們開放0.5+外卡」), followed by explicit confirmation that this is a narrow risk-acceptance exception.

The machine-readable receipt is `rotation-wildcard-05-risk-acceptance.json`. It is a project-maintained record of the cited decision, not a user-signed receipt. Receipt schema v2 also binds `rotation-wildcard-denied-behavior-contract-v1.json` at SHA-256 `2092dc39fe69837df9f3bc332197732d7c32afee503c0526e5c9bbc141451081`; the verifier independently pins that digest and recomputes every listed source hash.

## Delivery trust boundary and review disposition

After the fresh independent closure review, ArcherKuo explicitly selected: 「以人工 PR 審查為信任邊界：記錄限制，開 PR 待合併，不宣稱防繞過發布」. This is a delivery-scope clarification, not a change to the machine-readable behavioral authorization or historical research evidence.

The build checks are fail-closed **when invoked**, not a tamper-proof external release boundary. A repository writer can remove verifier invocation from `package.json` or modify verifier authority. Human PR review must therefore examine build invocation, verifier implementation, contract/receipt changes, and covered-source changes together. No GitHub branch protection or Cloudflare delivery-policy enforcement was configured or verified by this change.

The independent review confirmed marker reachability plus real built-app behavior and the pinned source contract work within the verifier execution path. It retained a P1 finding for mutable build-command bypass; that technical limitation is accepted under the explicitly selected human-review trust boundary, not reported as fixed or as an unqualified review pass. OpenSpec task 9.7 retains its unchecked status for the stronger end-to-end enforcement claim. Delivery is an open PR only, without merge or deployment; stronger external enforcement requires separately authorized follow-up.

## Bound evidence and accepted risk

- Representative report SHA-256: `877f11c0a4cf0b64a18054e478be75f72a9d1c25e9d478dc7c2ea6ab22187b8c`
- Representative summary SHA-256: `f34bce0ed38430fdc60eb58b8c7fef316d3548f6075978f207e0139dd4771b44`
- Candidate: fixed band `0.5` with the existing rotation wildcard
- Equal-cell repeat reduction: `0.24171979941345476` (24.17%), below the preregistered 25% effect gate
- Fairness: 11 of 29 cells failed; worst cell p95 cumulative appearance shortfall was 3 and worst cell p95 non-voluntary-rest increase was 2
- The historical report, summary, receipt, protocol, primary rows, and evaluation report remain unchanged and continue to state failure.

## Scope boundary

This exception authorizes only production wildcard generation at band `0.5`. It does not authorize a fairness-band change, probability change, cooldown change, lineage change, data-validation change, or UI-scope change. Existing doubles 25% / singles 12.5% draws, two-match shared cooldown, persistence, strict validation, Rating isolation, and preview-only display remain unchanged.

The denied-behavior contract is a deliberately conservative source allowlist derived from the real matchmaking/store call path, lineage and persistence validators, and the App entrypoint's preview/live/session/history/import UI surfaces. It is not a whole-repository freeze. Any byte edit to a pinned file, including a cosmetic edit, requires review and an explicit contract/receipt/verifier rebinding; a behavior change additionally requires separate owner authority and cannot be authorized by merely refreshing hashes.

Release verification scans only JavaScript chunks reachable from the Vite `index.html` manifest entry, rejects index/manifest inconsistency, and executes the actual self-contained built entry in a network-disabled disposable DOM using deterministic doubles and singles fixtures. The probe requires a persisted versioned lineage and exactly one playing-seat replacement at the correct mode cardinality; a marker-preserving bypass therefore still fails.

Rollback is to set `ROTATION_WILDCARD_GENERATION_RELEASED` back to `false` and remove this risk-acceptance receipt. This record does not authorize commit, push, PR creation, merge, deployment, Jira updates, or OpenSpec archive.

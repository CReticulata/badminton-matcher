import { createHash } from 'node:crypto'

export interface ReleaseCandidateGate {
  candidateBand: number
  passesEffectGate: boolean
  passesEveryCellFairnessGate: boolean
  requiredDisclosedRegressions: string[]
  relativeRepeatReduction?: number | null
  failedFairnessCells?: number
  totalFairnessCells?: number
  maxAppearanceShortfallP95?: number
  maxNonVoluntaryRestIncreaseP95?: number
}

export interface SliceRegressionCell {
  absoluteRepeatRates: { A: number; D: number }
  appearanceShortfallP95: number
  appearanceShortfallP99: number
  appearanceShortfallMax: number
  nonVoluntaryRestIncreaseP95: number
  nonVoluntaryRestIncreaseP99: number
  nonVoluntaryRestIncreaseMax: number
}

export function assertCanonicalCandidateCellSets(
  candidates: readonly { cells: Record<string, SliceRegressionCell> }[],
  expectedCellIds: readonly string[],
): void {
  const canonical = [...expectedCellIds].sort()
  if (
    canonical.length === 0
    || new Set(canonical).size !== canonical.length
    || candidates.length === 0
  ) throw new Error('Canonical cell authority is empty or duplicated')
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate.cells || typeof candidate.cells !== 'object' || Array.isArray(candidate.cells)) {
      throw new Error(`Candidate ${index} does not contain a canonical cell record`)
    }
    const actual = Object.keys(candidate.cells).sort()
    if (
      actual.length !== canonical.length
      || actual.some((cellId, cellIndex) => cellId !== canonical[cellIndex])
    ) throw new Error(`Candidate ${index} canonical cell identity set mismatch`)
  }
}

const requireNonNegativeFinite = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
    throw new Error(`Invalid summary regression metric: ${field}`)
  }
}

export function canonicalizeSliceRegressions(
  cells: Record<string, SliceRegressionCell>,
): string[] {
  const regressions: string[] = []
  for (const [cellId, cell] of Object.entries(cells)) {
    if (!cellId) throw new Error('Invalid empty summary cell identity')
    requireNonNegativeFinite(cell.absoluteRepeatRates?.A, `${cellId}.absoluteRepeatRates.A`)
    requireNonNegativeFinite(cell.absoluteRepeatRates?.D, `${cellId}.absoluteRepeatRates.D`)
    if (cell.absoluteRepeatRates.D > cell.absoluteRepeatRates.A) {
      regressions.push(`cell=${cellId};metric=actual-repeat-rate`)
    }
    const metrics = [
      ['appearance-shortfall-p95', cell.appearanceShortfallP95],
      ['appearance-shortfall-p99', cell.appearanceShortfallP99],
      ['appearance-shortfall-max', cell.appearanceShortfallMax],
      ['non-voluntary-rest-p95', cell.nonVoluntaryRestIncreaseP95],
      ['non-voluntary-rest-p99', cell.nonVoluntaryRestIncreaseP99],
      ['non-voluntary-rest-max', cell.nonVoluntaryRestIncreaseMax],
    ] as const
    for (const [metric, value] of metrics) {
      requireNonNegativeFinite(value, `${cellId}.${metric}`)
      if (value > 0) regressions.push(`cell=${cellId};metric=${metric}`)
    }
  }
  return regressions.sort()
}

export interface RotationWildcardApprovalManifestV1 {
  schemaVersion: 1
  selectedCandidateBand: number
  reportSha256: string
  summarySha256: string
  approver: string
  sourceMessageId: string
  disclosedRegressions: string[]
}

export const DENIED_BEHAVIOR_CATEGORY_PATHS = {
  fairnessBand: [
    'src/lib/matchmaking.ts',
    'src/store.ts',
  ],
  probability: [
    'src/lib/matchmaking.ts',
    'src/lib/rotation-wildcard-release-authority.ts',
    'src/lib/rotation-wildcard-release.ts',
    'src/store.ts',
  ],
  cooldown: [
    'src/lib/app-data-normalization.ts',
    'src/lib/csv.ts',
    'src/lib/persistence.ts',
    'src/lib/rotation-fairness.ts',
    'src/store.ts',
    'src/types.ts',
  ],
  lineage: [
    'src/lib/app-data-normalization.ts',
    'src/lib/csv.ts',
    'src/lib/matchmaking.ts',
    'src/lib/rotation-chronology.ts',
    'src/lib/rotation-wildcard-lineage.ts',
    'src/store.ts',
    'src/types.ts',
  ],
  dataValidation: [
    'src/lib/app-data-normalization.ts',
    'src/lib/csv.ts',
    'src/lib/persistence.ts',
    'src/lib/rotation-wildcard-lineage.ts',
    'src/types.ts',
  ],
  uiScope: [
    'src/App.vue',
    'src/components/HistoryView.vue',
    'src/components/LiveScoringFormatEditor.vue',
    'src/components/MatchDisplay.vue',
    'src/components/PlayerChip.vue',
    'src/components/PlayersView.vue',
    'src/components/PreviewView.vue',
    'src/components/RecoveryView.vue',
    'src/components/ScoreInput.vue',
    'src/components/ScoringFormatPicker.vue',
    'src/components/SessionView.vue',
    'src/main.ts',
  ],
} as const

export interface DeniedBehaviorContractV1 {
  schemaVersion: 1
  contractId: 'rotation-wildcard-denied-behavior-v1'
  categories: Record<keyof typeof DENIED_BEHAVIOR_CATEGORY_PATHS, string[]>
  sources: { path: string; sha256: string }[]
}

const DENIED_BEHAVIOR_CONTRACT_KEYS = ['schemaVersion', 'contractId', 'categories', 'sources'] as const
const DENIED_BEHAVIOR_CATEGORY_KEYS = Object.keys(DENIED_BEHAVIOR_CATEGORY_PATHS).sort()
const DENIED_BEHAVIOR_SOURCE_PATHS = [...new Set(
  Object.values(DENIED_BEHAVIOR_CATEGORY_PATHS).flat(),
)].sort()

export function assertDeniedBehaviorContract(
  contract: DeniedBehaviorContractV1,
  sourceBytes: ReadonlyMap<string, Uint8Array | string>,
): void {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('Denied-behavior contract must be an object')
  }
  assertExactKeys(contract, DENIED_BEHAVIOR_CONTRACT_KEYS, 'Denied-behavior contract')
  if (contract.schemaVersion !== 1 || contract.contractId !== 'rotation-wildcard-denied-behavior-v1') {
    throw new Error('Unsupported denied-behavior contract identity')
  }
  if (!contract.categories || typeof contract.categories !== 'object' || Array.isArray(contract.categories)) {
    throw new Error('Denied-behavior contract categories are invalid')
  }
  assertExactKeys(contract.categories, DENIED_BEHAVIOR_CATEGORY_KEYS, 'Denied-behavior contract categories')
  for (const category of DENIED_BEHAVIOR_CATEGORY_KEYS as (keyof typeof DENIED_BEHAVIOR_CATEGORY_PATHS)[]) {
    const actual = contract.categories[category]
    const expected = DENIED_BEHAVIOR_CATEGORY_PATHS[category]
    if (
      !Array.isArray(actual)
      || actual.length !== expected.length
      || actual.some((path, index) => path !== expected[index])
    ) throw new Error(`Denied-behavior category allowlist mismatch: ${category}`)
  }
  if (!Array.isArray(contract.sources)) throw new Error('Denied-behavior sources must be an array')
  const actualPaths = contract.sources.map((source) => source?.path)
  if (
    actualPaths.length !== DENIED_BEHAVIOR_SOURCE_PATHS.length
    || actualPaths.some((path, index) => path !== DENIED_BEHAVIOR_SOURCE_PATHS[index])
  ) throw new Error('Denied-behavior source path set has missing or surplus paths')
  const suppliedPaths = [...sourceBytes.keys()].sort()
  if (
    suppliedPaths.length !== DENIED_BEHAVIOR_SOURCE_PATHS.length
    || suppliedPaths.some((path, index) => path !== DENIED_BEHAVIOR_SOURCE_PATHS[index])
  ) throw new Error('Denied-behavior source bytes have missing or surplus paths')
  for (const source of contract.sources) {
    assertExactKeys(source, ['path', 'sha256'], `Denied-behavior source ${source.path}`)
    if (!/^[0-9a-f]{64}$/.test(source.sha256)) {
      throw new Error(`Denied-behavior source hash is invalid: ${source.path}`)
    }
    const bytes = sourceBytes.get(source.path)
    if (bytes === undefined) throw new Error(`Denied-behavior source is missing: ${source.path}`)
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== source.sha256) throw new Error(`Denied-behavior source hash mismatch: ${source.path}`)
  }
}

export interface RotationWildcardRiskAcceptanceManifestV2 {
  schemaVersion: 2
  selectedCandidateBand: number
  reportSha256: string
  summarySha256: string
  approver: string
  sourceMessageId: string
  observedRelativeRepeatReduction: number
  failedFairnessCells: number
  totalFairnessCells: number
  maxAppearanceShortfallP95: number
  maxNonVoluntaryRestIncreaseP95: number
  deniedBehaviorContractSha256: string
  acknowledgesPromotionGateFailure: true
  authorizesWildcardGeneration: true
  authorizesFairnessBandChange: false
  authorizesProbabilityChange: false
  authorizesCooldownChange: false
  authorizesLineageChange: false
  authorizesDataValidationChange: false
  authorizesUiScopeChange: false
}

export interface ReleaseAuthorityInput {
  productionFairnessBand: number
  productionWildcardReleased: boolean
  approvalManifest: RotationWildcardApprovalManifestV1 | null
  riskAcceptanceManifest?: RotationWildcardRiskAcceptanceManifestV2 | null
  deniedBehaviorContractSha256?: string
  reportSha256: string
  summarySha256: string
  candidates: ReleaseCandidateGate[]
}

const requireNonEmpty = (value: string, field: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
}

const RISK_ACCEPTANCE_REPORT_SHA256 = '877f11c0a4cf0b64a18054e478be75f72a9d1c25e9d478dc7c2ea6ab22187b8c'
const RISK_ACCEPTANCE_SUMMARY_SHA256 = 'f34bce0ed38430fdc60eb58b8c7fef316d3548f6075978f207e0139dd4771b44'
export const RISK_ACCEPTANCE_DENIED_BEHAVIOR_CONTRACT_SHA256 = '2092dc39fe69837df9f3bc332197732d7c32afee503c0526e5c9bbc141451081'

const RISK_ACCEPTANCE_KEYS = [
  'schemaVersion', 'selectedCandidateBand', 'reportSha256', 'summarySha256',
  'approver', 'sourceMessageId', 'observedRelativeRepeatReduction',
  'failedFairnessCells', 'totalFairnessCells', 'maxAppearanceShortfallP95',
  'maxNonVoluntaryRestIncreaseP95', 'deniedBehaviorContractSha256',
  'acknowledgesPromotionGateFailure',
  'authorizesWildcardGeneration', 'authorizesFairnessBandChange',
  'authorizesProbabilityChange', 'authorizesCooldownChange',
  'authorizesLineageChange', 'authorizesDataValidationChange', 'authorizesUiScopeChange',
] as const

function assertExactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`${field} has missing or surplus fields`)
  }
}

function requireCanonicalMetric(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
    throw new Error(`Invalid risk acceptance metric: ${field}`)
  }
}

function assertRiskAcceptance(
  manifest: RotationWildcardRiskAcceptanceManifestV2,
  input: ReleaseAuthorityInput,
): void {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Risk acceptance manifest must be an object or null')
  }
  assertExactKeys(manifest, RISK_ACCEPTANCE_KEYS, 'Risk acceptance manifest')
  if (manifest.schemaVersion !== 2) throw new Error('Unsupported risk acceptance manifest schema')
  if (manifest.selectedCandidateBand !== 0.5 || input.productionFairnessBand !== 0.5) {
    throw new Error('Risk acceptance is restricted to production fairness band 0.5')
  }
  requireNonEmpty(manifest.reportSha256, 'riskAcceptance.reportSha256')
  requireNonEmpty(manifest.summarySha256, 'riskAcceptance.summarySha256')
  if (
    manifest.reportSha256 !== RISK_ACCEPTANCE_REPORT_SHA256
    || manifest.summarySha256 !== RISK_ACCEPTANCE_SUMMARY_SHA256
  ) throw new Error('Risk acceptance digest is not the bound representative evidence')
  requireNonEmpty(manifest.approver, 'riskAcceptance.approver')
  requireNonEmpty(manifest.sourceMessageId, 'riskAcceptance.sourceMessageId')
  if (manifest.approver !== 'ArcherKuo' || manifest.sourceMessageId !== '1546861022458159164') {
    throw new Error('Risk acceptance approver or source message mismatch')
  }
  if (manifest.reportSha256 !== input.reportSha256) throw new Error('Risk acceptance report digest mismatch')
  if (manifest.summarySha256 !== input.summarySha256) throw new Error('Risk acceptance summary digest mismatch')
  if (
    manifest.deniedBehaviorContractSha256 !== RISK_ACCEPTANCE_DENIED_BEHAVIOR_CONTRACT_SHA256
    || input.deniedBehaviorContractSha256 !== RISK_ACCEPTANCE_DENIED_BEHAVIOR_CONTRACT_SHA256
  ) throw new Error('Risk acceptance denied-behavior contract digest mismatch')

  const candidate = input.candidates.find((item) => item.candidateBand === 0.5)
  if (!candidate) throw new Error('Risk acceptance candidate 0.5 is missing from evidence')
  if (candidate.passesEffectGate || candidate.passesEveryCellFairnessGate) {
    throw new Error('Risk acceptance requires the disclosed promotion-gate failure')
  }
  requireCanonicalMetric(candidate.relativeRepeatReduction, 'relativeRepeatReduction')
  requireCanonicalMetric(candidate.failedFairnessCells, 'failedFairnessCells')
  requireCanonicalMetric(candidate.totalFairnessCells, 'totalFairnessCells')
  requireCanonicalMetric(candidate.maxAppearanceShortfallP95, 'maxAppearanceShortfallP95')
  requireCanonicalMetric(candidate.maxNonVoluntaryRestIncreaseP95, 'maxNonVoluntaryRestIncreaseP95')
  if (
    !Number.isInteger(candidate.failedFairnessCells)
    || !Number.isInteger(candidate.totalFairnessCells)
    || candidate.failedFairnessCells > candidate.totalFairnessCells
  ) throw new Error('Risk acceptance fairness-cell counts are invalid')
  const evidenceBindings = [
    ['relative repeat reduction', manifest.observedRelativeRepeatReduction, candidate.relativeRepeatReduction],
    ['failed fairness cells', manifest.failedFairnessCells, candidate.failedFairnessCells],
    ['total fairness cells', manifest.totalFairnessCells, candidate.totalFairnessCells],
    ['appearance shortfall p95', manifest.maxAppearanceShortfallP95, candidate.maxAppearanceShortfallP95],
    ['non-voluntary rest p95', manifest.maxNonVoluntaryRestIncreaseP95, candidate.maxNonVoluntaryRestIncreaseP95],
  ] as const
  for (const [field, claimed, observed] of evidenceBindings) {
    requireCanonicalMetric(claimed, field)
    if (claimed !== observed) throw new Error(`Risk acceptance ${field} evidence mismatch`)
  }
  if (
    manifest.acknowledgesPromotionGateFailure !== true
    || manifest.authorizesWildcardGeneration !== true
  ) throw new Error('Risk acceptance must literally acknowledge and authorize wildcard generation')
  for (const field of [
    'authorizesFairnessBandChange', 'authorizesProbabilityChange', 'authorizesCooldownChange',
    'authorizesLineageChange', 'authorizesDataValidationChange', 'authorizesUiScopeChange',
  ] as const) {
    if (manifest[field] !== false) throw new Error(`Risk acceptance cannot authorize adjacent capability: ${field}`)
  }
  if (!input.productionWildcardReleased) {
    throw new Error('Risk-accepted wildcard release must enable production generation')
  }
}

function assertCandidateAuthorityPayloads(candidates: readonly ReleaseCandidateGate[]): void {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Candidate authority payload must be a non-empty array')
  }
  const bands = new Set<number>()
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`Candidate ${index} authority payload is invalid`)
    }
    if (
      typeof candidate.candidateBand !== 'number'
      || !Number.isFinite(candidate.candidateBand)
      || candidate.candidateBand < 0
      || Object.is(candidate.candidateBand, -0)
      || bands.has(candidate.candidateBand)
    ) throw new Error(`Candidate ${index} band must be finite, non-negative, and unique`)
    bands.add(candidate.candidateBand)
    if (
      typeof candidate.passesEffectGate !== 'boolean'
      || typeof candidate.passesEveryCellFairnessGate !== 'boolean'
    ) throw new Error(`Candidate ${index} gate results must be booleans`)
    const disclosures = candidate.requiredDisclosedRegressions
    if (
      !Array.isArray(disclosures)
      || disclosures.some((item) => typeof item !== 'string' || !item.trim())
      || new Set(disclosures).size !== disclosures.length
      || disclosures.some((item, disclosureIndex) => (
        item !== [...disclosures].sort()[disclosureIndex]
      ))
    ) throw new Error(`Candidate ${index} canonical disclosures are malformed`)
  }
}

const PRODUCTION_GENERATION_MARKER = 'rotation-wildcard-generation-release-v1'

export function assertProductionBundleWildcardRelease(
  bundleTexts: readonly string[],
  wildcardReleased = false,
): void {
  const hasMarker = bundleTexts.some((text) => text.includes(PRODUCTION_GENERATION_MARKER))
  if (wildcardReleased && !hasMarker) {
    throw new Error('Released production bundle is missing rotation wildcard generation')
  }
  if (!wildcardReleased && hasMarker) {
    throw new Error('Production bundle contains unreleased rotation wildcard generation')
  }
}

export function assertRotationWildcardReleaseAuthority(input: ReleaseAuthorityInput): void {
  assertCandidateAuthorityPayloads(input.candidates)
  if (typeof input.productionWildcardReleased !== 'boolean') {
    throw new Error('Production wildcard released authority must be boolean')
  }
  if (
    typeof input.productionFairnessBand !== 'number'
    || !Number.isFinite(input.productionFairnessBand)
    || input.productionFairnessBand < 0
    || Object.is(input.productionFairnessBand, -0)
  ) throw new Error('Production fairness band must be a canonical finite non-negative number')
  const manifest = input.approvalManifest
  const riskAcceptanceManifest = input.riskAcceptanceManifest ?? null
  if (manifest !== null && riskAcceptanceManifest !== null) {
    throw new Error('Ordinary approval and risk acceptance cannot coexist')
  }
  if (riskAcceptanceManifest !== null) {
    assertRiskAcceptance(riskAcceptanceManifest, input)
    return
  }
  if (manifest === null) {
    if (input.productionFairnessBand !== 0.5) {
      throw new Error('Absent approval manifest requires production fairness band 0.5')
    }
    if (input.productionWildcardReleased) {
      throw new Error('Absent approval manifest requires production wildcard generation to remain unreleased')
    }
    return
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Approval manifest must be an object or null')
  }

  if (manifest.schemaVersion !== 1) throw new Error('Unsupported approval manifest schema')
  if (
    typeof manifest.selectedCandidateBand !== 'number'
    || !Number.isFinite(manifest.selectedCandidateBand)
    || manifest.selectedCandidateBand < 0
    || Object.is(manifest.selectedCandidateBand, -0)
  ) throw new Error('Approval candidate band must be canonical, finite, and non-negative')
  requireNonEmpty(manifest.reportSha256, 'reportSha256')
  requireNonEmpty(manifest.summarySha256, 'summarySha256')
  requireNonEmpty(manifest.approver, 'approver')
  requireNonEmpty(manifest.sourceMessageId, 'sourceMessageId')
  if (
    !Array.isArray(manifest.disclosedRegressions)
    || manifest.disclosedRegressions.some((item) => typeof item !== 'string' || !item.trim())
  ) throw new Error('Approval disclosed regressions must be non-empty strings')

  if (manifest.reportSha256 !== input.reportSha256) throw new Error('Approval report digest mismatch')
  if (manifest.summarySha256 !== input.summarySha256) throw new Error('Approval summary digest mismatch')
  if (manifest.selectedCandidateBand !== input.productionFairnessBand) {
    throw new Error('Production fairness band does not match approval candidate')
  }
  if (!input.productionWildcardReleased) {
    throw new Error('Approved wildcard release must enable production generation')
  }
  const candidate = input.candidates.find((item) => item.candidateBand === manifest.selectedCandidateBand)
  if (!candidate) throw new Error('Approval candidate is not in the representative candidate set')
  if (!candidate.passesEffectGate || !candidate.passesEveryCellFairnessGate) {
    throw new Error('Approval candidate did not pass every promotion gate')
  }
  if (
    manifest.disclosedRegressions.length !== candidate.requiredDisclosedRegressions.length
    || manifest.disclosedRegressions.some(
      (item, index) => item !== candidate.requiredDisclosedRegressions[index],
    )
  ) throw new Error('Approval disclosed regressions do not match canonical summary evidence')
}

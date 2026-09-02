export interface ReleaseCandidateGate {
  candidateBand: number
  passesEffectGate: boolean
  passesEveryCellFairnessGate: boolean
  requiredDisclosedRegressions: string[]
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

export interface ReleaseAuthorityInput {
  productionFairnessBand: number
  productionWildcardReleased: boolean
  approvalManifest: RotationWildcardApprovalManifestV1 | null
  reportSha256: string
  summarySha256: string
  candidates: ReleaseCandidateGate[]
}

const requireNonEmpty = (value: string, field: string) => {
  if (!value.trim()) throw new Error(`${field} is required`)
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

export function assertProductionBundleHasNoWildcardGenerator(bundleTexts: readonly string[]): void {
  if (bundleTexts.some((text) => text.includes(PRODUCTION_GENERATION_MARKER))) {
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

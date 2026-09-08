import { describe, expect, it } from 'vitest'
import {
  assertCanonicalCandidateCellSets,
  assertProductionBundleWildcardRelease,
  assertRotationWildcardReleaseAuthority,
  canonicalizeSliceRegressions,
  type ReleaseAuthorityInput,
} from './release-authority'

const base = (): ReleaseAuthorityInput => ({
  productionFairnessBand: 0.5,
  productionWildcardReleased: false,
  approvalManifest: null,
  reportSha256: 'report',
  summarySha256: 'summary',
  candidates: [
    {
      candidateBand: 0.25,
      passesEffectGate: true,
      passesEveryCellFairnessGate: false,
      requiredDisclosedRegressions: [],
    },
  ],
})

describe('rotation wildcard release authority', () => {
  it('rejects ambiguous or malformed candidate authority payloads before any manifest branch', () => {
    const valid = base().candidates[0]!
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [valid, { ...valid }],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [{ ...valid, candidateBand: Number.NaN }],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [{ ...valid, passesEffectGate: 'yes' } as never],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [{ ...valid, passesEveryCellFairnessGate: 1 } as never],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [{ ...valid, requiredDisclosedRegressions: ['z', 'a'] }],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), candidates: [{ ...valid, candidateBand: -0 }],
    })).toThrow(/candidate/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), productionWildcardReleased: 0 as never,
    })).toThrow(/production/i)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), productionFairnessBand: Number.NaN,
    })).toThrow(/production/i)
  })

  it('requires every candidate to contain the exact canonical cell identity set', () => {
    const cell = {
      absoluteRepeatRates: { A: 0, D: 0 },
      appearanceShortfallP95: 0,
      appearanceShortfallP99: 0,
      appearanceShortfallMax: 0,
      nonVoluntaryRestIncreaseP95: 0,
      nonVoluntaryRestIncreaseP99: 0,
      nonVoluntaryRestIncreaseMax: 0,
    }
    const exact = { cells: { a: cell, b: cell } }
    expect(() => assertCanonicalCandidateCellSets([exact, exact], ['b', 'a'])).not.toThrow()
    expect(() => assertCanonicalCandidateCellSets([
      { cells: { a: cell } },
    ], ['a', 'b'])).toThrow(/canonical cell/i)
    expect(() => assertCanonicalCandidateCellSets([
      { cells: { a: cell, b: cell, c: cell } },
    ], ['a', 'b'])).toThrow(/canonical cell/i)
    expect(() => assertCanonicalCandidateCellSets([
      exact,
      { cells: { a: cell } },
    ], ['a', 'b'])).toThrow(/canonical cell/i)
  })

  it('canonicalizes every summary-derived slice regression with stable ordering', () => {
    expect(canonicalizeSliceRegressions({
      z: {
        absoluteRepeatRates: { A: 0.1, D: 0.2 },
        appearanceShortfallP95: 1,
        appearanceShortfallP99: 2,
        appearanceShortfallMax: 3,
        nonVoluntaryRestIncreaseP95: 0,
        nonVoluntaryRestIncreaseP99: 1,
        nonVoluntaryRestIncreaseMax: 2,
      },
      a: {
        absoluteRepeatRates: { A: 0.2, D: 0.1 },
        appearanceShortfallP95: 0,
        appearanceShortfallP99: 0,
        appearanceShortfallMax: 0,
        nonVoluntaryRestIncreaseP95: 0,
        nonVoluntaryRestIncreaseP99: 0,
        nonVoluntaryRestIncreaseMax: 0,
      },
    })).toEqual([
      'cell=z;metric=actual-repeat-rate',
      'cell=z;metric=appearance-shortfall-max',
      'cell=z;metric=appearance-shortfall-p95',
      'cell=z;metric=appearance-shortfall-p99',
      'cell=z;metric=non-voluntary-rest-max',
      'cell=z;metric=non-voluntary-rest-p99',
    ])
  })

  it('rejects negative-zero summary metrics as non-canonical evidence', () => {
    const cell = {
      absoluteRepeatRates: { A: -0, D: 0 },
      appearanceShortfallP95: 0,
      appearanceShortfallP99: 0,
      appearanceShortfallMax: 0,
      nonVoluntaryRestIncreaseP95: 0,
      nonVoluntaryRestIncreaseP99: 0,
      nonVoluntaryRestIncreaseMax: 0,
    }
    expect(() => canonicalizeSliceRegressions({ cell })).toThrow(/metric/i)
    expect(() => canonicalizeSliceRegressions({
      cell: { ...cell, absoluteRepeatRates: { A: 0, D: 0 }, appearanceShortfallP95: -0 },
    })).toThrow(/metric/i)
  })

  it('rejects a production bundle containing the wildcard generation marker', () => {
    expect(() => assertProductionBundleWildcardRelease([
      'const value = "rotation-wildcard-generation-release-v1"',
    ])).toThrow(/production bundle/i)
    expect(() => assertProductionBundleWildcardRelease(['const value = "safe"'])).not.toThrow()
  })

  it('requires the wildcard generation marker in a released production bundle', () => {
    expect(() => assertProductionBundleWildcardRelease(['const value = "safe"'], true)).toThrow(/missing/i)
    expect(() => assertProductionBundleWildcardRelease([
      'const value = "rotation-wildcard-generation-release-v1"',
    ], true)).not.toThrow()
  })

  it('allows an absent approval only when 0.5 remains and production wildcard generation is disabled', () => {
    expect(() => assertRotationWildcardReleaseAuthority(base())).not.toThrow()
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), productionFairnessBand: 0.25,
    })).toThrow(/0\.5/)
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(), productionWildcardReleased: true,
    })).toThrow(/unreleased/i)
  })

  it('rejects approval of a candidate that did not pass every gate', () => {
    expect(() => assertRotationWildcardReleaseAuthority({
      ...base(),
      productionFairnessBand: 0.25,
      productionWildcardReleased: true,
      approvalManifest: {
        schemaVersion: 1,
        selectedCandidateBand: 0.25,
        reportSha256: 'report',
        summarySha256: 'summary',
        approver: 'ArcherKuo',
        sourceMessageId: 'message',
        disclosedRegressions: ['fairness gate failed'],
      },
    })).toThrow(/did not pass/i)
  })

  const riskAccepted = (): ReleaseAuthorityInput => ({
    ...base(),
    productionWildcardReleased: true,
    reportSha256: '877f11c0a4cf0b64a18054e478be75f72a9d1c25e9d478dc7c2ea6ab22187b8c',
    summarySha256: 'f34bce0ed38430fdc60eb58b8c7fef316d3548f6075978f207e0139dd4771b44',
    deniedBehaviorContractSha256: '2092dc39fe69837df9f3bc332197732d7c32afee503c0526e5c9bbc141451081',
    candidates: [{
      candidateBand: 0.5,
      passesEffectGate: false,
      passesEveryCellFairnessGate: false,
      requiredDisclosedRegressions: [],
      relativeRepeatReduction: 0.24171979941345476,
      failedFairnessCells: 11,
      totalFairnessCells: 29,
      maxAppearanceShortfallP95: 3,
      maxNonVoluntaryRestIncreaseP95: 2,
    }],
    riskAcceptanceManifest: {
      schemaVersion: 2,
      selectedCandidateBand: 0.5,
      reportSha256: '877f11c0a4cf0b64a18054e478be75f72a9d1c25e9d478dc7c2ea6ab22187b8c',
      summarySha256: 'f34bce0ed38430fdc60eb58b8c7fef316d3548f6075978f207e0139dd4771b44',
      approver: 'ArcherKuo',
      sourceMessageId: '1546861022458159164',
      observedRelativeRepeatReduction: 0.24171979941345476,
      failedFairnessCells: 11,
      totalFairnessCells: 29,
      maxAppearanceShortfallP95: 3,
      maxNonVoluntaryRestIncreaseP95: 2,
      deniedBehaviorContractSha256: '2092dc39fe69837df9f3bc332197732d7c32afee503c0526e5c9bbc141451081',
      acknowledgesPromotionGateFailure: true,
      authorizesWildcardGeneration: true,
      authorizesFairnessBandChange: false,
      authorizesProbabilityChange: false,
      authorizesCooldownChange: false,
      authorizesLineageChange: false,
      authorizesDataValidationChange: false,
      authorizesUiScopeChange: false,
    },
  })

  it('accepts the exact owner risk acceptance for production wildcard at band 0.5', () => {
    expect(() => assertRotationWildcardReleaseAuthority(riskAccepted())).not.toThrow()
  })

  it.each([
    'authorizesFairnessBandChange',
    'authorizesProbabilityChange',
    'authorizesCooldownChange',
    'authorizesLineageChange',
    'authorizesDataValidationChange',
    'authorizesUiScopeChange',
  ] as const)('rejects widened adjacent authority in %s', (field) => {
    const input = riskAccepted()
    input.riskAcceptanceManifest = { ...input.riskAcceptanceManifest!, [field]: true }
    expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/adjacent capability/i)
  })

  it.each([
    [true, false],
    [false, true],
  ] as const)('rejects mixed promotion gates effect=%s fairness=%s', (
    passesEffectGate,
    passesEveryCellFairnessGate,
  ) => {
    const input = riskAccepted()
    input.candidates = [{
      ...input.candidates[0]!, passesEffectGate, passesEveryCellFairnessGate,
    }]
    expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/promotion-gate failure/i)
  })

  it('rejects a risk acceptance with a different approver or source message', () => {
    for (const riskAcceptanceManifest of [
      { ...riskAccepted().riskAcceptanceManifest!, approver: 'someone-else' },
      { ...riskAccepted().riskAcceptanceManifest!, sourceMessageId: 'different-message' },
    ]) {
      expect(() => assertRotationWildcardReleaseAuthority({
        ...riskAccepted(), riskAcceptanceManifest,
      } as ReleaseAuthorityInput)).toThrow(/risk acceptance/i)
    }
  })

  it('rejects self-consistent risk acceptance digests that are not the bound evidence', () => {
    for (const field of ['reportSha256', 'summarySha256'] as const) {
      const input = riskAccepted()
      input[field] = 'a'.repeat(64)
      input.riskAcceptanceManifest = {
        ...input.riskAcceptanceManifest!,
        [field]: input[field],
      }
      expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/digest/i)
    }
  })

  it('rejects a self-consistent denied-behavior contract digest not pinned by verifier authority', () => {
    const input = riskAccepted()
    input.deniedBehaviorContractSha256 = 'a'.repeat(64)
    input.riskAcceptanceManifest = {
      ...input.riskAcceptanceManifest!,
      deniedBehaviorContractSha256: input.deniedBehaviorContractSha256,
    }
    expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/contract digest/i)
  })

  it('fails closed for malformed, missing, mismatched, wrong-band, or widened risk acceptance', () => {
    const missingField = riskAccepted()
    delete (missingField.riskAcceptanceManifest as {
      authorizesUiScopeChange?: false
    }).authorizesUiScopeChange
    const malformed = [
      { ...riskAccepted(), riskAcceptanceManifest: 'invalid' },
      { ...riskAccepted(), riskAcceptanceManifest: null },
      missingField,
      {
        ...riskAccepted(),
        approvalManifest: {
          schemaVersion: 1,
          selectedCandidateBand: 0.5,
          reportSha256: 'report',
          summarySha256: 'summary',
          approver: 'ArcherKuo',
          sourceMessageId: 'message',
          disclosedRegressions: [],
        },
      },
      {
        ...riskAccepted(),
        productionFairnessBand: 0.25,
        riskAcceptanceManifest: {
          ...riskAccepted().riskAcceptanceManifest!, selectedCandidateBand: 0.25,
        },
      },
      {
        ...riskAccepted(),
        riskAcceptanceManifest: {
          ...riskAccepted().riskAcceptanceManifest!, unexpected: false,
        },
      },
      {
        ...riskAccepted(),
        riskAcceptanceManifest: {
          ...riskAccepted().riskAcceptanceManifest!, authorizesProbabilityChange: true,
        },
      },
      {
        ...riskAccepted(),
        riskAcceptanceManifest: {
          ...riskAccepted().riskAcceptanceManifest!, acknowledgesPromotionGateFailure: false,
        },
      },
      { ...riskAccepted(), productionWildcardReleased: false },
      { ...riskAccepted(), candidates: [] },
    ] as unknown as ReleaseAuthorityInput[]
    for (const input of malformed) {
      expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow()
    }

    for (const field of [
      'observedRelativeRepeatReduction', 'failedFairnessCells', 'totalFairnessCells',
      'maxAppearanceShortfallP95', 'maxNonVoluntaryRestIncreaseP95',
    ] as const) {
      const input = riskAccepted()
      input.riskAcceptanceManifest = {
        ...input.riskAcceptanceManifest!, [field]: input.riskAcceptanceManifest![field] + 1,
      }
      expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/evidence mismatch|cell counts/i)
    }
  })

  it('accepts only a passing candidate with exact evidence and production bindings', () => {
    const input = base()
    input.candidates = [
      {
        candidateBand: 0.25,
        passesEffectGate: true,
        passesEveryCellFairnessGate: true,
        requiredDisclosedRegressions: ['regression-a', 'regression-b'],
      },
    ]
    input.productionFairnessBand = 0.25
    input.productionWildcardReleased = true
    input.approvalManifest = {
      schemaVersion: 1,
      selectedCandidateBand: 0.25,
      reportSha256: 'report',
      summarySha256: 'summary',
      approver: 'ArcherKuo',
      sourceMessageId: 'message',
      disclosedRegressions: ['regression-a', 'regression-b'],
    }
    expect(() => assertRotationWildcardReleaseAuthority(input)).not.toThrow()
    expect(() => assertRotationWildcardReleaseAuthority({
      ...input,
      reportSha256: 'tampered',
    })).toThrow(/report digest/i)
    for (const disclosedRegressions of [
      [42],
      [],
      ['regression-a', 'fabricated'],
      ['regression-b', 'regression-a'],
    ]) {
      expect(() => assertRotationWildcardReleaseAuthority({
        ...input,
        approvalManifest: { ...input.approvalManifest!, disclosedRegressions } as never,
      })).toThrow(/disclosed regressions/i)
    }
  })

  it('rejects negative-zero approval identity even when production and candidate are positive zero', () => {
    const input = base()
    input.candidates = [{
      candidateBand: 0,
      passesEffectGate: true,
      passesEveryCellFairnessGate: true,
      requiredDisclosedRegressions: [],
    }]
    input.productionFairnessBand = 0
    input.productionWildcardReleased = true
    input.approvalManifest = {
      schemaVersion: 1,
      selectedCandidateBand: -0,
      reportSha256: 'report',
      summarySha256: 'summary',
      approver: 'ArcherKuo',
      sourceMessageId: 'message',
      disclosedRegressions: [],
    }
    expect(() => assertRotationWildcardReleaseAuthority(input)).toThrow(/candidate/i)
  })
})

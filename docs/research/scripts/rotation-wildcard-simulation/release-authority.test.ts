import { describe, expect, it } from 'vitest'
import {
  assertCanonicalCandidateCellSets,
  assertProductionBundleHasNoWildcardGenerator,
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
    expect(() => assertProductionBundleHasNoWildcardGenerator([
      'const value = "rotation-wildcard-generation-release-v1"',
    ])).toThrow(/production bundle/i)
    expect(() => assertProductionBundleHasNoWildcardGenerator(['const value = "safe"'])).not.toThrow()
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

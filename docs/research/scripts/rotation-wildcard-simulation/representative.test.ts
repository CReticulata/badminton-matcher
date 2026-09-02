import { describe, expect, it } from 'vitest'
import type { EvaluationRow } from './evaluator'
import {
  buildRepresentativeSummary,
  renderRepresentativeReport,
  type RepresentativeContract,
} from './representative'

const seeds = Array.from({ length: 500 }, (_, index) => `seed-${index}`)
const contract: RepresentativeContract = {
  candidateBands: [0.5, 1],
  cellIds: ['cell'],
  seeds,
}

describe('representative evidence builder', () => {
  it('ranks only passing candidates and reports authoritative vs sensitivity metrics', () => {
    const rows = [
      ...candidateRows(0.5, (_seedIndex, method) => ({
        actualRepeatCount: 1,
        shortfall: method === 'D' ? 0 : 0,
      })),
      ...candidateRows(1, (seedIndex, method) => ({
        actualRepeatCount: method === 'D' && seedIndex >= 350 ? 0 : 1,
        shortfall: method === 'D' ? 1 : 0,
      })),
    ]

    const summary = buildRepresentativeSummary(rows, contract)
    const report = renderRepresentativeReport(summary)

    expect(summary.recommendedCandidateBand).toBe(1)
    expect(summary.productionFairnessBand).toBe(0.5)
    expect(summary.productionChangeAuthorized).toBe(false)
    expect(summary.candidates.find((candidate) => candidate.candidateBand === 1)?.passesEffectGate).toBe(true)
    expect(summary.candidates.find((candidate) => candidate.candidateBand === 1)?.passesEveryCellFairnessGate).toBe(true)
    expect(report).toContain('Production change authorized: **no**')
    expect(report).toContain('Pooled sensitivity (non-authoritative)')
    expect(report).toContain('No-capacity controls')
    expect(report).toContain('| 1 | cell | 1.000 | 0.000 | pass |')
  })

  it('returns no recommendation when every candidate fails a gate', () => {
    const rows = candidateRows(1, (_seedIndex, method) => ({
      actualRepeatCount: method === 'D' ? 1 : 1,
      shortfall: method === 'D' ? 2 : 0,
    }))

    expect(
      buildRepresentativeSummary(rows, {
        ...contract,
        candidateBands: [1],
      }).recommendedCandidateBand,
    ).toBeNull()
  })
})

function candidateRows(
  candidateBand: number,
  values: (
    seedIndex: number,
    method: EvaluationRow['method'],
  ) => { actualRepeatCount: number; shortfall: number },
): EvaluationRow[] {
  return seeds.flatMap((seed, seedIndex) =>
    (['A', 'B', 'C', 'D'] as const).map((method) => {
      const value = values(seedIndex, method)
      return {
        candidateBand,
        cellId: 'cell',
        seed,
        method,
        eligibleOpportunities: 1,
        noCapacityControls: 1,
        actualRepeatCount: value.actualRepeatCount,
        triggerRepeatCount: 1,
        maxAppearanceShortfallVsA: value.shortfall,
        maxNonVoluntaryRestIncreaseVsA: 0,
        fixedRatingsDigest: 'fixed',
      }
    }),
  )
}

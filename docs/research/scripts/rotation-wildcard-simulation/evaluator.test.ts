import { describe, expect, it } from 'vitest'
import {
  evaluateScenarioBands,
  evaluateScenario,
  measureRepeatOpportunity,
  summarizeCandidateRows,
  type EvaluationRow,
  type SummaryContract,
} from './evaluator'
import { buildScenarioManifest } from './manifest'
import { buildRepresentativeProtocol } from './protocol'

const seeds = Array.from({ length: 500 }, (_, index) => `seed-${index}`)
const contract: SummaryContract = {
  candidateBand: 1,
  cellIds: ['cell-a', 'cell-b'],
  seeds,
}

describe('repeat opportunity measurement', () => {
  it('uses actual t vs actual t-2 as effect and normal vs actual t-2 only as trigger diagnostic', () => {
    const measured = measureRepeatOpportunity({
      completedPlayingSets: [
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'c', 'e'],
      ],
      normalPlayingIds: ['a', 'b', 'c', 'd'],
      actualPlayingIds: ['a', 'b', 'c', 'e'],
      eligibleIds: ['a', 'b', 'c', 'd', 'e'],
      voluntaryRestIds: [],
    })

    expect(measured).toEqual({
      effectEligible: true,
      noCapacityControl: false,
      actualRepeat: false,
      triggerRepeat: true,
    })
  })

  it('counts no-replacement rounds as controls outside the effect denominator', () => {
    const measured = measureRepeatOpportunity({
      completedPlayingSets: [
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'c', 'd'],
      ],
      normalPlayingIds: ['a', 'b', 'c', 'd'],
      actualPlayingIds: ['a', 'b', 'c', 'd'],
      eligibleIds: ['a', 'b', 'c', 'd'],
      voluntaryRestIds: [],
    })

    expect(measured.effectEligible).toBe(false)
    expect(measured.noCapacityControl).toBe(true)
    expect(measured.actualRepeat).toBe(true)
    expect(measured.triggerRepeat).toBe(true)
  })
})

describe('paired candidate aggregation', () => {
  it('uses equal cell weights, preserves baseline-zero cells, and treats pooled values as sensitivity only', () => {
    const rows = [
      ...pairedRows('cell-a', (seedIndex, method) => ({
        eligibleOpportunities: 1,
        actualRepeatCount:
          method === 'D' ? (seedIndex % 2 === 0 ? 1 : 0) : 1,
        maxAppearanceShortfallVsA: method === 'D' ? 1 : 0,
        maxNonVoluntaryRestIncreaseVsA: method === 'D' ? 1 : 0,
      })),
      ...pairedRows('cell-b', () => ({
        eligibleOpportunities: 100,
        actualRepeatCount: 0,
        maxAppearanceShortfallVsA: 0,
        maxNonVoluntaryRestIncreaseVsA: 0,
      })),
    ]

    const summary = summarizeCandidateRows(rows, contract)

    expect(summary.equalCellMean.A).toBe(0.5)
    expect(summary.equalCellMean.D).toBe(0.25)
    expect(summary.relativeRepeatReduction).toBe(0.5)
    expect(summary.cells['cell-b']!.baselineRelativeReduction).toBeNull()
    expect(summary.cells['cell-b']!.absoluteRepeatRates).toEqual({ A: 0, B: 0, C: 0, D: 0 })
    expect(summary.cells['cell-a']!.appearanceShortfallP95).toBe(1)
    expect(summary.cells['cell-a']!.nonVoluntaryRestIncreaseP95).toBe(1)
    expect(summary.passesEffectGate).toBe(true)
    expect(summary.passesEveryCellFairnessGate).toBe(true)
    expect(summary.pooledSensitivity).toBeDefined()
  })

  it('uses conservative nearest-rank p95 without interpolation for every cell', () => {
    const passing = pairedRows('cell-a', (seedIndex, method) => ({
      eligibleOpportunities: 1,
      actualRepeatCount: method === 'D' ? 0 : 1,
      maxAppearanceShortfallVsA: method === 'D' && seedIndex >= 475 ? 2 : 0,
      maxNonVoluntaryRestIncreaseVsA: 0,
    }))
    const passingRows = [...passing, ...pairedRows('cell-b', () => baseMetrics())]
    expect(
      summarizeCandidateRows(passingRows, contract).cells['cell-a']!
        .appearanceShortfallP95,
    ).toBe(0)

    const failing = pairedRows('cell-a', (seedIndex, method) => ({
      eligibleOpportunities: 1,
      actualRepeatCount: method === 'D' ? 0 : 1,
      maxAppearanceShortfallVsA: method === 'D' && seedIndex >= 474 ? 2 : 0,
      maxNonVoluntaryRestIncreaseVsA: 0,
    }))
    const summary = summarizeCandidateRows(
      [...failing, ...pairedRows('cell-b', () => baseMetrics())],
      contract,
    )
    expect(summary.cells['cell-a']!.appearanceShortfallP95).toBe(2)
    expect(summary.passesEveryCellFairnessGate).toBe(false)
  })

  it('rejects a promotion contract with fewer than 500 seeds', () => {
    const shortSeeds = seeds.slice(0, 499)
    const rows = [
      ...pairedRows('cell-a', () => baseMetrics()),
      ...pairedRows('cell-b', () => baseMetrics()),
    ].filter((row) => shortSeeds.includes(row.seed))

    expect(() =>
      summarizeCandidateRows(rows, { ...contract, seeds: shortSeeds }),
    ).toThrow(/at least 500 seeds/i)
  })

  it.each([
    {
      label: 'missing counterpart',
      mutate: (rows: EvaluationRow[]) => rows.filter(
        (row) => !(row.cellId === 'cell-a' && row.seed === 'seed-0' && row.method === 'D'),
      ),
      message: /exactly one A, B, C, and D/i,
    },
    {
      label: 'duplicate counterpart',
      mutate: (rows: EvaluationRow[]) => [rows[0]!, ...rows],
      message: /exactly one A, B, C, and D/i,
    },
    {
      label: 'surplus cell',
      mutate: (rows: EvaluationRow[]) => [
        ...rows,
        { ...rows[0]!, cellId: 'cell-surplus' },
      ],
      message: /unexpected cell/i,
    },
  ])('fails closed on $label', ({ mutate, message }) => {
    const rows = [
      ...pairedRows('cell-a', () => baseMetrics()),
      ...pairedRows('cell-b', () => baseMetrics()),
    ]

    expect(() => summarizeCandidateRows(mutate(rows), contract)).toThrow(message)
  })
})

describe('A/B/C/D scenario evaluator', () => {
  it('uses one immutable manifest and fixed Rating covariates across deterministic methods', () => {
    const protocol = buildRepresentativeProtocol()
    const cell = protocol.cells.find(
      (candidate) =>
        candidate.mode === 'doubles' &&
        candidate.participantCount === 8 &&
        candidate.attendanceFamily === 'late-join' &&
        candidate.durationFamily === 'variable' &&
        candidate.ratingProfile === 'continuous',
    )!
    const manifest = buildScenarioManifest({
      cell,
      seed: protocol.seeds[0]!,
      rounds: 12,
    })

    const first = evaluateScenario({ manifest, candidateBand: 1 })
    const repeated = evaluateScenario({ manifest, candidateBand: 1 })

    expect(repeated).toEqual(first)
    expect(first.map((row) => row.method)).toEqual(['A', 'B', 'C', 'D'])
    expect(new Set(first.map((row) => row.fixedRatingsDigest)).size).toBe(1)
    expect(first.every((row) => row.cellId === cell.id)).toBe(true)
    expect(first.every((row) => row.seed === protocol.seeds[0])).toBe(true)
  })

  it('caches current-band A/C without changing any per-band row', () => {
    const protocol = buildRepresentativeProtocol()
    const cell = protocol.cells.find(
      (candidate) => candidate.mode === 'singles' && candidate.participantCount === 6,
    )!
    const manifest = buildScenarioManifest({
      cell,
      seed: protocol.seeds[1]!,
      rounds: 12,
    })
    const bands = [0, 1, 8]

    expect(evaluateScenarioBands({ manifest, candidateBands: bands })).toEqual(
      bands.flatMap((candidateBand) => evaluateScenario({ manifest, candidateBand })),
    )
  })
})

function pairedRows(
  cellId: string,
  metrics: (
    seedIndex: number,
    method: EvaluationRow['method'],
  ) => Pick<
    EvaluationRow,
    | 'eligibleOpportunities'
    | 'actualRepeatCount'
    | 'maxAppearanceShortfallVsA'
    | 'maxNonVoluntaryRestIncreaseVsA'
  >,
): EvaluationRow[] {
  return seeds.flatMap((seed, seedIndex) =>
    (['A', 'B', 'C', 'D'] as const).map((method) => ({
      candidateBand: 1,
      cellId,
      seed,
      method,
      noCapacityControls: 0,
      triggerRepeatCount: 0,
      ...metrics(seedIndex, method),
    })),
  )
}

function baseMetrics(): Pick<
  EvaluationRow,
  | 'eligibleOpportunities'
  | 'actualRepeatCount'
  | 'maxAppearanceShortfallVsA'
  | 'maxNonVoluntaryRestIncreaseVsA'
> {
  return {
    eligibleOpportunities: 1,
    actualRepeatCount: 1,
    maxAppearanceShortfallVsA: 0,
    maxNonVoluntaryRestIncreaseVsA: 0,
  }
}

import { createHash } from 'node:crypto'
import {
  applyRotationWildcard,
  generateRound,
  type Candidate,
  type Rng,
} from '../../../../src/lib/matchmaking'
import type { Mode } from '../../../../src/types'
import { keyedRandom, type RandomStream, type ScenarioManifest } from './manifest'
import type { SimulationMethod } from './protocol'

export interface EvaluationRow {
  candidateBand: number
  cellId: string
  seed: string
  method: SimulationMethod
  eligibleOpportunities: number
  noCapacityControls: number
  actualRepeatCount: number
  triggerRepeatCount: number
  maxAppearanceShortfallVsA: number
  maxNonVoluntaryRestIncreaseVsA: number
  fixedRatingsDigest?: string
}

export interface SummaryContract {
  candidateBand: number
  cellIds: string[]
  seeds: string[]
}

interface CellSummary {
  absoluteRepeatRates: Record<SimulationMethod, number>
  baselineRelativeReduction: number | null
  appearanceShortfallP95: number
  nonVoluntaryRestIncreaseP95: number
  appearanceShortfallP99: number
  nonVoluntaryRestIncreaseP99: number
  appearanceShortfallMax: number
  nonVoluntaryRestIncreaseMax: number
  passesFairnessGate: boolean
}

export interface CandidateSummary {
  candidateBand: number
  equalCellMean: Record<SimulationMethod, number>
  relativeRepeatReduction: number | null
  passesEffectGate: boolean
  passesEveryCellFairnessGate: boolean
  cells: Record<string, CellSummary>
  pooledSensitivity: {
    repeatRates: Record<SimulationMethod, number>
    relativeRepeatReduction: number | null
  }
}

export function measureRepeatOpportunity(input: {
  completedPlayingSets: readonly (readonly string[])[]
  normalPlayingIds: readonly string[]
  actualPlayingIds: readonly string[]
  eligibleIds: readonly string[]
  voluntaryRestIds: readonly string[]
}): {
  effectEligible: boolean
  noCapacityControl: boolean
  actualRepeat: boolean
  triggerRepeat: boolean
} {
  const twoBack = input.completedPlayingSets.at(-2)
  const actualRepeat = Boolean(twoBack && sameSet(input.actualPlayingIds, twoBack))
  const triggerRepeat = Boolean(twoBack && sameSet(input.normalPlayingIds, twoBack))
  const normal = new Set(input.normalPlayingIds)
  const volunteerRest = new Set(input.voluntaryRestIds)
  const hasReplacementCapacity = input.eligibleIds.some(
    (id) => !normal.has(id) && !volunteerRest.has(id),
  )
  const hasTwoBack = twoBack !== undefined
  return {
    effectEligible: hasTwoBack && hasReplacementCapacity,
    noCapacityControl: hasTwoBack && !hasReplacementCapacity,
    actualRepeat,
    triggerRepeat,
  }
}

export function evaluateScenario(input: {
  manifest: Readonly<ScenarioManifest>
  candidateBand: number
}): EvaluationRow[] {
  const methods: SimulationMethod[] = ['A', 'B', 'C', 'D']
  const outcomes = methods.map((method) =>
    runMethod(input.manifest, method, input.candidateBand),
  )
  return rowsFromOutcomes(outcomes, input.manifest, input.candidateBand)
}

export function evaluateScenarioBands(input: {
  manifest: Readonly<ScenarioManifest>
  candidateBands: readonly number[]
}): EvaluationRow[] {
  const methodA = runMethod(input.manifest, 'A', 0.5)
  const methodC = runMethod(input.manifest, 'C', 0.5)
  return input.candidateBands.flatMap((candidateBand) =>
    rowsFromOutcomes(
      [
        methodA,
        runMethod(input.manifest, 'B', candidateBand),
        methodC,
        runMethod(input.manifest, 'D', candidateBand),
      ],
      input.manifest,
      candidateBand,
    ),
  )
}

function rowsFromOutcomes(
  outcomes: readonly RunOutcome[],
  manifest: Readonly<ScenarioManifest>,
  candidateBand: number,
): EvaluationRow[] {
  const baseline = outcomes[0]!
  return outcomes.map((outcome) => ({
    ...outcome.row,
    candidateBand,
    maxAppearanceShortfallVsA: maximumAppearanceShortfall(
      baseline.appearanceTimeline,
      outcome.appearanceTimeline,
      manifest.participantIds,
    ),
    maxNonVoluntaryRestIncreaseVsA: Math.max(
      0,
      outcome.maximumNonVoluntaryRestRun - baseline.maximumNonVoluntaryRestRun,
    ),
  }))
}

export function summarizeCandidateRows(
  rows: readonly EvaluationRow[],
  contract: SummaryContract,
): CandidateSummary {
  validateRows(rows, contract)
  const cells: Record<string, CellSummary> = {}

  for (const cellId of contract.cellIds) {
    const cellRows = rows.filter((row) => row.cellId === cellId)
    const absoluteRepeatRates = Object.fromEntries(
      (['A', 'B', 'C', 'D'] as const).map((method) => {
        const seedRates = cellRows
          .filter((row) => row.method === method && row.eligibleOpportunities > 0)
          .map((row) => row.actualRepeatCount / row.eligibleOpportunities)
        return [method, mean(seedRates)]
      }),
    ) as Record<SimulationMethod, number>
    const dRows = cellRows.filter((row) => row.method === 'D')
    const appearanceShortfallP95 = nearestRank(
      dRows.map((row) => row.maxAppearanceShortfallVsA),
      0.95,
    )
    const nonVoluntaryRestIncreaseP95 = nearestRank(
      dRows.map((row) => row.maxNonVoluntaryRestIncreaseVsA),
      0.95,
    )
    const appearanceValues = dRows.map((row) => row.maxAppearanceShortfallVsA)
    const restValues = dRows.map((row) => row.maxNonVoluntaryRestIncreaseVsA)
    cells[cellId] = {
      absoluteRepeatRates,
      baselineRelativeReduction: relativeReduction(
        absoluteRepeatRates.A,
        absoluteRepeatRates.D,
      ),
      appearanceShortfallP95,
      nonVoluntaryRestIncreaseP95,
      appearanceShortfallP99: nearestRank(appearanceValues, 0.99),
      nonVoluntaryRestIncreaseP99: nearestRank(restValues, 0.99),
      appearanceShortfallMax: Math.max(...appearanceValues),
      nonVoluntaryRestIncreaseMax: Math.max(...restValues),
      passesFairnessGate:
        appearanceShortfallP95 <= 1 && nonVoluntaryRestIncreaseP95 <= 1,
    }
  }

  const equalCellMean = Object.fromEntries(
    (['A', 'B', 'C', 'D'] as const).map((method) => [
      method,
      mean(contract.cellIds.map((cellId) => cells[cellId]!.absoluteRepeatRates[method])),
    ]),
  ) as Record<SimulationMethod, number>
  const relativeRepeatReduction = relativeReduction(
    equalCellMean.A,
    equalCellMean.D,
  )
  const pooledRates = Object.fromEntries(
    (['A', 'B', 'C', 'D'] as const).map((method) => {
      const methodRows = rows.filter((row) => row.method === method)
      const eligible = sum(methodRows.map((row) => row.eligibleOpportunities))
      const repeats = sum(methodRows.map((row) => row.actualRepeatCount))
      return [method, eligible === 0 ? 0 : repeats / eligible]
    }),
  ) as Record<SimulationMethod, number>

  return {
    candidateBand: contract.candidateBand,
    equalCellMean,
    relativeRepeatReduction,
    passesEffectGate:
      relativeRepeatReduction !== null && relativeRepeatReduction >= 0.25,
    passesEveryCellFairnessGate: Object.values(cells).every(
      (cell) => cell.passesFairnessGate,
    ),
    cells,
    pooledSensitivity: {
      repeatRates: pooledRates,
      relativeRepeatReduction: relativeReduction(pooledRates.A, pooledRates.D),
    },
  }
}

interface RunOutcome {
  row: EvaluationRow
  appearanceTimeline: Record<string, number>[]
  maximumNonVoluntaryRestRun: number
}

function runMethod(
  manifest: Readonly<ScenarioManifest>,
  method: SimulationMethod,
  candidateBand: number,
): RunOutcome {
  const band = method === 'A' || method === 'C' ? 0.5 : candidateBand
  const wildcardEnabled = method === 'C' || method === 'D'
  const appearances = new Map(manifest.participantIds.map((id) => [id, 0]))
  const eligibleMinutes = new Map(manifest.participantIds.map((id) => [id, 0]))
  const consecutivePlay = new Map(manifest.participantIds.map((id) => [id, 0]))
  const currentRestRun = new Map(manifest.participantIds.map((id) => [id, 0]))
  const maxRestRun = new Map(manifest.participantIds.map((id) => [id, 0]))
  const completedPlayingSets: string[][] = []
  const appearanceTimeline: Record<string, number>[] = []
  let cooldownRemaining = 0
  let eligibleOpportunities = 0
  let noCapacityControls = 0
  let actualRepeatCount = 0
  let triggerRepeatCount = 0

  for (const round of manifest.rounds) {
    const present = new Set(round.presentIds)
    const voluntaryRest = new Set(round.voluntaryRestIds)
    const candidates: Candidate[] = round.presentIds.map((id) => {
      const minutes = eligibleMinutes.get(id) ?? 0
      return {
        id,
        playCount: appearances.get(id) ?? 0,
        ratePerHour: minutes === 0 ? 0 : ((appearances.get(id) ?? 0) * 60) / minutes,
        consecutivePlayCount: consecutivePlay.get(id) ?? 0,
        rating: manifest.ratings[id]!,
        volunteerRest: voluntaryRest.has(id),
      }
    })
    const normalProposal = generateRound(
      candidates,
      round.mode,
      keyedStream(manifest.seed, 'normal-tie', round.round, 0),
      undefined,
      band,
    )
    if (!normalProposal) {
      addEligibleMinutes(round.durationMinutes, present, voluntaryRest, eligibleMinutes)
      continue
    }

    const normalPlayingIds = [...normalProposal.teamA, ...normalProposal.teamB]
    const proposal = wildcardEnabled
      ? applyRotationWildcard({
          normalProposal,
          candidates,
          completedPlayingSets,
          cooldownRemaining,
          fairnessReliable: true,
          rng: wildcardSequence(manifest.seed, round.round),
        })
      : normalProposal
    const actualPlayingIds = [...proposal.teamA, ...proposal.teamB]
    const measured = measureRepeatOpportunity({
      completedPlayingSets,
      normalPlayingIds,
      actualPlayingIds,
      eligibleIds: round.presentIds,
      voluntaryRestIds: round.voluntaryRestIds,
    })
    if (measured.effectEligible) eligibleOpportunities++
    if (measured.noCapacityControl) noCapacityControls++
    if (measured.effectEligible && measured.actualRepeat) actualRepeatCount++
    if (measured.effectEligible && measured.triggerRepeat) triggerRepeatCount++

    const playing = new Set(actualPlayingIds)
    for (const id of manifest.participantIds) {
      if (playing.has(id)) {
        appearances.set(id, (appearances.get(id) ?? 0) + 1)
        consecutivePlay.set(id, (consecutivePlay.get(id) ?? 0) + 1)
        currentRestRun.set(id, 0)
      } else {
        consecutivePlay.set(id, 0)
        if (present.has(id) && !voluntaryRest.has(id)) {
          const nextRun = (currentRestRun.get(id) ?? 0) + 1
          currentRestRun.set(id, nextRun)
          maxRestRun.set(id, Math.max(maxRestRun.get(id) ?? 0, nextRun))
        } else {
          currentRestRun.set(id, 0)
        }
      }
    }
    appearanceTimeline.push(Object.fromEntries(appearances))
    completedPlayingSets.push(actualPlayingIds)
    if (proposal.rotationWildcard) cooldownRemaining = 2
    else if (cooldownRemaining > 0) cooldownRemaining--
    addEligibleMinutes(round.durationMinutes, present, voluntaryRest, eligibleMinutes)
  }

  return {
    row: {
      candidateBand,
      cellId: manifest.cellId,
      seed: manifest.seed,
      method,
      eligibleOpportunities,
      noCapacityControls,
      actualRepeatCount,
      triggerRepeatCount,
      maxAppearanceShortfallVsA: 0,
      maxNonVoluntaryRestIncreaseVsA: 0,
      fixedRatingsDigest: createHash('sha256')
        .update(JSON.stringify(Object.entries(manifest.ratings).sort()))
        .digest('hex'),
    },
    appearanceTimeline,
    maximumNonVoluntaryRestRun: Math.max(0, ...maxRestRun.values()),
  }
}

function keyedStream(
  seed: string,
  stream: RandomStream,
  round: number,
  attempt: number,
): Rng {
  let draw = 0
  return () => keyedRandom({ seed, stream, round, attempt, draw: draw++ })
}

function wildcardSequence(
  seed: string,
  round: number,
): Rng {
  const streams: RandomStream[] = [
    'wildcard-probability',
    'wildcard-exchange-out',
    'wildcard-exchange-in',
    'normal-tie',
  ]
  let draw = 0
  return () => {
    const index = draw++
    const stream = streams[Math.min(index, streams.length - 1)]!
    return keyedRandom({
      seed,
      stream,
      round,
      attempt: index >= 3 ? 1 : 0,
      draw: index >= 3 ? index - 3 : 0,
    })
  }
}

function addEligibleMinutes(
  duration: number,
  present: ReadonlySet<string>,
  voluntaryRest: ReadonlySet<string>,
  eligibleMinutes: Map<string, number>,
): void {
  for (const id of present) {
    if (!voluntaryRest.has(id)) {
      eligibleMinutes.set(id, (eligibleMinutes.get(id) ?? 0) + duration)
    }
  }
}

function maximumAppearanceShortfall(
  baseline: readonly Record<string, number>[],
  candidate: readonly Record<string, number>[],
  participantIds: readonly string[],
): number {
  if (baseline.length !== candidate.length) {
    throw new Error('Paired methods produced different completed-opportunity counts')
  }
  let maximum = 0
  for (let index = 0; index < baseline.length; index++) {
    for (const id of participantIds) {
      maximum = Math.max(
        maximum,
        (baseline[index]![id] ?? 0) - (candidate[index]![id] ?? 0),
      )
    }
  }
  return maximum
}

function validateRows(rows: readonly EvaluationRow[], contract: SummaryContract): void {
  if (contract.seeds.length < 500 || new Set(contract.seeds).size !== contract.seeds.length) {
    throw new Error('Promotion summary requires at least 500 seeds')
  }
  if (new Set(contract.cellIds).size !== contract.cellIds.length) {
    throw new Error('Promotion summary cell identities must be unique')
  }
  const expectedCells = new Set(contract.cellIds)
  const expectedSeeds = new Set(contract.seeds)
  for (const row of rows) {
    if (!expectedCells.has(row.cellId)) throw new Error(`Unexpected cell: ${row.cellId}`)
    if (!expectedSeeds.has(row.seed)) throw new Error(`Unexpected seed: ${row.seed}`)
    if (row.candidateBand !== contract.candidateBand) {
      throw new Error('Candidate band does not match the summary contract')
    }
    if (
      !Number.isInteger(row.eligibleOpportunities) ||
      row.eligibleOpportunities < 0 ||
      row.actualRepeatCount < 0 ||
      row.actualRepeatCount > row.eligibleOpportunities
    ) {
      throw new Error('Invalid primary row metric counts')
    }
  }

  for (const cellId of contract.cellIds) {
    for (const seed of contract.seeds) {
      const counterparts = rows.filter(
        (row) => row.cellId === cellId && row.seed === seed,
      )
      const methods = counterparts.map((row) => row.method).sort().join(',')
      if (counterparts.length !== 4 || methods !== 'A,B,C,D') {
        throw new Error(`Each (cell, seed) requires exactly one A, B, C, and D counterpart`)
      }
    }
  }
  if (rows.length !== contract.cellIds.length * contract.seeds.length * 4) {
    throw new Error('Primary rows contain surplus counterpart identities')
  }
}

function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error('Cannot compute a percentile from no values')
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(percentile * sorted.length) - 1]!
}

function relativeReduction(baseline: number, candidate: number): number | null {
  return baseline === 0 ? null : (baseline - candidate) / baseline
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return rightSet.size === right.length && left.every((id) => rightSet.has(id))
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

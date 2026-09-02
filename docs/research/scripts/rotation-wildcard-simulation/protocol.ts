export const CANDIDATE_BANDS = [
  0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8,
] as const

export const METHODS = ['A', 'B', 'C', 'D'] as const

export const ATTENDANCE_FAMILIES = [
  'fixed',
  'late-join',
  'leave-rejoin',
  'voluntary-rest',
] as const

export const DURATION_FAMILIES = ['fixed', 'variable'] as const
export const RATING_PROFILES = ['equal', 'continuous', 'extreme'] as const
export const MODE_FAMILIES = ['singles', 'doubles', 'mixed'] as const

export type SimulationMethod = (typeof METHODS)[number]
export type AttendanceFamily = (typeof ATTENDANCE_FAMILIES)[number]
export type DurationFamily = (typeof DURATION_FAMILIES)[number]
export type RatingProfile = (typeof RATING_PROFILES)[number]
export type ModeFamily = (typeof MODE_FAMILIES)[number]

export interface SimulationCell {
  id: string
  mode: ModeFamily
  participantCount: number
  attendanceFamily: AttendanceFamily
  durationFamily: DurationFamily
  ratingProfile: RatingProfile
}

export interface SimulationProtocol {
  schemaVersion: 2
  matrixDesign: 'deterministic-covering-v1'
  runKind: 'representative'
  candidateBands: readonly number[]
  methods: readonly string[]
  methodDefinitions: Readonly<
    Record<SimulationMethod, { band: 'current' | 'candidate'; wildcard: boolean }>
  >
  roundsPerScenario: 24
  seeds: string[]
  cells: SimulationCell[]
  metrics: {
    effect: {
      primary: 'actual-t-vs-actual-t-minus-2'
      denominator: 'round-level-replacement-capacity'
      aggregation: 'equal-cell'
      minimumRelativeReduction: number
    }
    fairness: {
      sampleUnit: 'paired-cell-seed-maxima'
      percentile: number
      quantile: 'nearest-rank-no-interpolation'
      maximumIncrease: number
      everyCellMustPass: true
    }
  }
}

const METHOD_DEFINITIONS: SimulationProtocol['methodDefinitions'] = {
  A: { band: 'current', wildcard: false },
  B: { band: 'candidate', wildcard: false },
  C: { band: 'current', wildcard: true },
  D: { band: 'candidate', wildcard: true },
}

const METRICS: SimulationProtocol['metrics'] = {
  effect: {
    primary: 'actual-t-vs-actual-t-minus-2',
    denominator: 'round-level-replacement-capacity',
    aggregation: 'equal-cell',
    minimumRelativeReduction: 0.25,
  },
  fairness: {
    sampleUnit: 'paired-cell-seed-maxima',
    percentile: 0.95,
    quantile: 'nearest-rank-no-interpolation',
    maximumIncrease: 1,
    everyCellMustPass: true,
  },
}

export function buildRepresentativeProtocol(): Readonly<SimulationProtocol> {
  return deepFreeze({
    schemaVersion: 2,
    matrixDesign: 'deterministic-covering-v1',
    runKind: 'representative',
    candidateBands: [...CANDIDATE_BANDS],
    methods: [...METHODS],
    methodDefinitions: structuredClone(METHOD_DEFINITIONS),
    roundsPerScenario: 24,
    seeds: Array.from(
      { length: 500 },
      (_, index) => `rw51-representative-${String(index).padStart(4, '0')}`,
    ),
    cells: buildCells(),
    metrics: structuredClone(METRICS),
  })
}

export function expectedCellIds(): string[] {
  return buildCells().map((cell) => cell.id)
}

export function validateProtocol(
  protocol: SimulationProtocol,
): Readonly<SimulationProtocol> {
  if (
    protocol.schemaVersion !== 2 ||
    protocol.matrixDesign !== 'deterministic-covering-v1' ||
    protocol.runKind !== 'representative'
  ) {
    throw new Error('Unsupported representative protocol schema')
  }

  if (!samePrimitiveArray(protocol.candidateBands, CANDIDATE_BANDS)) {
    throw new Error('Protocol candidate bands do not match the frozen contract')
  }

  if (!samePrimitiveArray(protocol.methods, METHODS)) {
    throw new Error('Protocol methods must be exactly A, B, C, D')
  }

  if (JSON.stringify(protocol.methodDefinitions) !== JSON.stringify(METHOD_DEFINITIONS)) {
    throw new Error('Protocol method definitions must preserve exact A/B/C/D counterparts')
  }
  if (protocol.roundsPerScenario !== 24) {
    throw new Error('Representative protocol requires exactly 24 rounds per scenario')
  }

  if (protocol.seeds.length < 500) {
    throw new Error('Representative protocol requires at least 500 seeds per cell')
  }
  if (new Set(protocol.seeds).size !== protocol.seeds.length) {
    throw new Error('Representative protocol seeds must be unique')
  }

  const actualCellIds = protocol.cells.map((cell) => cell.id).sort()
  const requiredCellIds = expectedCellIds().sort()
  if (!samePrimitiveArray(actualCellIds, requiredCellIds)) {
    throw new Error('Protocol must contain the complete cell matrix exactly once')
  }
  for (const cell of protocol.cells) {
    if (cell.id !== cellId(cell)) {
      throw new Error('Protocol cell identity does not match its dimensions')
    }
  }

  if (JSON.stringify(protocol.metrics) !== JSON.stringify(METRICS)) {
    throw new Error('Protocol metric contract does not match the frozen contract')
  }

  return deepFreeze(protocol)
}

function buildCells(): SimulationCell[] {
  const cells: SimulationCell[] = []
  let ordinal = 0
  for (const mode of MODE_FAMILIES) {
    for (const participantCount of participantCounts(mode)) {
      const attendanceFamily = ATTENDANCE_FAMILIES[ordinal % ATTENDANCE_FAMILIES.length]!
      const durationFamily = DURATION_FAMILIES[
        Math.floor(ordinal / ATTENDANCE_FAMILIES.length) % DURATION_FAMILIES.length
      ]!
      const ratingProfile = RATING_PROFILES[ordinal % RATING_PROFILES.length]!
      const cell = {
        mode,
        participantCount,
        attendanceFamily,
        durationFamily,
        ratingProfile,
      }
      cells.push({ ...cell, id: cellId(cell) })
      ordinal++
    }
  }
  return cells
}

function participantCounts(mode: ModeFamily): number[] {
  if (mode === 'singles') return range(2, 10)
  if (mode === 'doubles') return range(4, 16)
  return range(4, 10)
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function cellId(cell: Omit<SimulationCell, 'id'>): string {
  return [
    cell.mode,
    cell.participantCount,
    cell.attendanceFamily,
    cell.durationFamily,
    cell.ratingProfile,
  ].join(':')
}

function samePrimitiveArray(
  actual: readonly (number | string)[],
  expected: readonly (number | string)[],
): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
    Object.freeze(value)
  }
  return value
}

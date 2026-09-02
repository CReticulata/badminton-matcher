import { createHash } from 'node:crypto'
import type { SimulationCell } from './protocol'

export type RandomStream =
  | 'attendance'
  | 'duration'
  | 'mode'
  | 'normal-tie'
  | 'wildcard-probability'
  | 'wildcard-exchange-out'
  | 'wildcard-exchange-in'

export interface KeyedRandomInput {
  seed: string
  stream: RandomStream
  round: number
  attempt: number
  draw: number
}

export interface ScenarioRound {
  round: number
  mode: 'singles' | 'doubles'
  presentIds: string[]
  voluntaryRestIds: string[]
  durationMinutes: number
}

export interface ScenarioManifest {
  schemaVersion: 1
  cellId: string
  seed: string
  participantIds: string[]
  ratings: Record<string, number>
  rounds: ScenarioRound[]
}

export function keyedRandom(input: KeyedRandomInput): number {
  assertNonNegativeInteger(input.round, 'round')
  assertNonNegativeInteger(input.attempt, 'attempt')
  assertNonNegativeInteger(input.draw, 'draw')
  const key = [
    'badminton-matcher-rw51-v1',
    input.seed,
    input.stream,
    input.round,
    input.attempt,
    input.draw,
  ].join('\u0000')
  const prefix = createHash('sha256').update(key).digest('hex').slice(0, 13)
  return Number.parseInt(prefix, 16) / 0x10_0000_0000_0000
}

export function buildScenarioManifest(input: {
  cell: Readonly<SimulationCell>
  seed: string
  rounds: number
}): Readonly<ScenarioManifest> {
  if (!Number.isInteger(input.rounds) || input.rounds <= 0) {
    throw new Error('Scenario rounds must be a positive integer')
  }

  const participantIds = Array.from(
    { length: input.cell.participantCount },
    (_, index) => `p${String(index + 1).padStart(2, '0')}`,
  )
  const ratings = buildRatings(participantIds, input.cell.ratingProfile)
  const rounds = Array.from({ length: input.rounds }, (_, round) => {
    const attendance = attendanceForRound({
      participantIds,
      family: input.cell.attendanceFamily,
      seed: input.seed,
      round,
      totalRounds: input.rounds,
    })
    return {
      round,
      mode: modeForRound(input.cell.mode, input.seed, round),
      presentIds: attendance.presentIds,
      voluntaryRestIds: attendance.voluntaryRestIds,
      durationMinutes:
        input.cell.durationFamily === 'fixed'
          ? 15
          : 10 +
            Math.floor(
              keyedRandom({
                seed: input.seed,
                stream: 'duration',
                round,
                attempt: 0,
                draw: 0,
              }) * 16,
            ),
    }
  })

  return deepFreeze({
    schemaVersion: 1,
    cellId: input.cell.id,
    seed: input.seed,
    participantIds,
    ratings,
    rounds,
  })
}

function attendanceForRound(input: {
  participantIds: string[]
  family: SimulationCell['attendanceFamily']
  seed: string
  round: number
  totalRounds: number
}): { presentIds: string[]; voluntaryRestIds: string[] } {
  const present = [...input.participantIds]
  const rotatingId =
    input.participantIds[
      Math.floor(
        keyedRandom({
          seed: input.seed,
          stream: 'attendance',
          round: input.round,
          attempt: 0,
          draw: 0,
        }) * input.participantIds.length,
      )
    ]!

  if (input.family === 'late-join') {
    const joinsAt = Math.max(1, Math.floor(input.totalRounds / 3))
    return {
      presentIds:
        input.round < joinsAt ? present.filter((id) => id !== rotatingId) : present,
      voluntaryRestIds: [],
    }
  }

  if (input.family === 'leave-rejoin') {
    const leavesAt = Math.floor(input.totalRounds / 3)
    const rejoinsAt = Math.max(leavesAt + 1, Math.ceil((input.totalRounds * 2) / 3))
    return {
      presentIds:
        input.round >= leavesAt && input.round < rejoinsAt
          ? present.filter((id) => id !== rotatingId)
          : present,
      voluntaryRestIds: [],
    }
  }

  if (input.family === 'voluntary-rest') {
    return { presentIds: present, voluntaryRestIds: [rotatingId] }
  }

  return { presentIds: present, voluntaryRestIds: [] }
}

function modeForRound(
  family: SimulationCell['mode'],
  seed: string,
  round: number,
): 'singles' | 'doubles' {
  if (family !== 'mixed') return family
  const offset =
    keyedRandom({
      seed,
      stream: 'mode',
      round: 0,
      attempt: 0,
      draw: 0,
    }) < 0.5
      ? 0
      : 1
  return (round + offset) % 2 === 0 ? 'doubles' : 'singles'
}

function buildRatings(
  participantIds: string[],
  profile: SimulationCell['ratingProfile'],
): Record<string, number> {
  return Object.fromEntries(
    participantIds.map((id, index) => {
      if (profile === 'equal') return [id, 1500]
      if (profile === 'continuous') {
        return [id, 1200 + (600 * index) / Math.max(1, participantIds.length - 1)]
      }
      return [id, index < participantIds.length / 2 ? 900 : 2100]
    }),
  )
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
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

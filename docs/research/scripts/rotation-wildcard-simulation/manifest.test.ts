import { describe, expect, it } from 'vitest'
import { buildRepresentativeProtocol } from './protocol'
import {
  buildScenarioManifest,
  keyedRandom,
  type RandomStream,
} from './manifest'

describe('named deterministic simulation streams', () => {
  it('repeats each keyed stream exactly and separates stream names', () => {
    const input = {
      seed: 'rw51-representative-0000',
      round: 7,
      attempt: 2,
      draw: 1,
    }
    const streams: RandomStream[] = [
      'attendance',
      'duration',
      'mode',
      'normal-tie',
      'wildcard-probability',
      'wildcard-exchange-out',
      'wildcard-exchange-in',
    ]

    const first = streams.map((stream) => keyedRandom({ ...input, stream }))
    const second = streams.map((stream) => keyedRandom({ ...input, stream }))

    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(streams.length)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('builds method-independent attendance, duration, mode, and Rating manifests', () => {
    const protocol = buildRepresentativeProtocol()
    const cell = protocol.cells.find(
      (candidate) =>
        candidate.mode === 'mixed' &&
        candidate.participantCount === 4 &&
        candidate.attendanceFamily === 'leave-rejoin' &&
        candidate.durationFamily === 'variable' &&
        candidate.ratingProfile === 'continuous',
    )!

    const manifest = buildScenarioManifest({
      cell,
      seed: protocol.seeds[0]!,
      rounds: 12,
    })
    const repeated = buildScenarioManifest({
      cell,
      seed: protocol.seeds[0]!,
      rounds: 12,
    })

    expect(repeated).toEqual(manifest)
    expect(manifest).not.toHaveProperty('method')
    expect(manifest.rounds.map((round) => round.mode)).toContain('singles')
    expect(manifest.rounds.map((round) => round.mode)).toContain('doubles')
    expect(manifest.rounds.some((round) => round.presentIds.length < 4)).toBe(true)
    expect(new Set(manifest.rounds.map((round) => round.durationMinutes)).size).toBeGreaterThan(1)
    expect(new Set(Object.values(manifest.ratings)).size).toBeGreaterThan(1)
  })

  it('materializes every required scenario cell', () => {
    const protocol = buildRepresentativeProtocol()

    for (const cell of protocol.cells) {
      const manifest = buildScenarioManifest({
        cell,
        seed: protocol.seeds[0]!,
        rounds: 3,
      })
      expect(manifest.cellId).toBe(cell.id)
      expect(manifest.rounds).toHaveLength(3)
      expect(Object.keys(manifest.ratings)).toHaveLength(cell.participantCount)
    }
  })

  it('does not shift later schedules when one method consumes branch-only draws', () => {
    const protocol = buildRepresentativeProtocol()
    const cell = protocol.cells.find(
      (candidate) =>
        candidate.mode === 'mixed' &&
        candidate.participantCount === 5 &&
        candidate.attendanceFamily === 'voluntary-rest' &&
        candidate.durationFamily === 'variable' &&
        candidate.ratingProfile === 'extreme',
    )!
    const seed = protocol.seeds[1]!

    const beforeBranch = buildScenarioManifest({ cell, seed, rounds: 8 })
    keyedRandom({ seed, stream: 'wildcard-probability', round: 3, attempt: 0, draw: 0 })
    keyedRandom({ seed, stream: 'wildcard-exchange-out', round: 3, attempt: 0, draw: 0 })
    keyedRandom({ seed, stream: 'wildcard-exchange-in', round: 3, attempt: 0, draw: 0 })
    const afterBranch = buildScenarioManifest({ cell, seed, rounds: 8 })

    expect(afterBranch.rounds).toEqual(beforeBranch.rounds)
  })
})

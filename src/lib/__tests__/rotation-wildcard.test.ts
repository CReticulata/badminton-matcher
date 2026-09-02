import { describe, expect, it } from 'vitest'
import type { RoundProposal } from '../../types'
import { applyRotationWildcard, type Candidate } from '../matchmaking'

const candidates: Candidate[] = [
  candidate('a', 1000), candidate('b', 1010), candidate('c', 1100),
  candidate('d', 1110), candidate('e', 1500),
]
const normal: RoundProposal = {
  mode: 'doubles', teamA: ['a', 'd'], teamB: ['b', 'c'], resters: ['e'],
}
const doublesHistory = [['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'e']] as const

describe('applyRotationWildcard', () => {
  it('replaces exactly one seat on an eligible successful doubles draw', () => {
    const proposal = run({ rng: sequenceRng(0.1, 0, 0, 0) })
    expect([...proposal.teamA, ...proposal.teamB].sort()).toEqual(['b', 'c', 'd', 'e'])
    expect(proposal.resters).toEqual(['a'])
    expect(proposal.rotationWildcard).toEqual({
      schemaVersion: 1,
      normalPlayingIds: ['a', 'b', 'c', 'd'],
      exchangedOutId: 'a',
      exchangedInId: 'e',
    })
  })

  it('requires two matches and exact order-insensitive t-2 equality', () => {
    for (const completedPlayingSets of [[], [['a', 'b', 'c', 'd']]] as const) {
      expect(run({
        completedPlayingSets,
        rng: () => { throw new Error('insufficient history must not draw') },
      })).toBe(normal)
    }
    expect(run({
      completedPlayingSets: [['d', 'b', 'a', 'c'], ['a', 'b', 'c', 'e']],
      rng: sequenceRng(0, 0, 0, 0),
    }).rotationWildcard).toBeDefined()
    expect(run({
      completedPlayingSets: [['a', 'b', 'c', 'e'], ['a', 'b', 'c', 'd']],
      rng: () => { throw new Error('ineligible transform must not draw') },
    })).toBe(normal)
  })

  it('uses shared chronology across differently-sized mixed modes', () => {
    const singles: RoundProposal = {
      mode: 'singles', teamA: ['a'], teamB: ['b'], resters: ['c', 'd', 'e'],
    }
    const proposal = run({
      normalProposal: singles,
      completedPlayingSets: [['b', 'a'], ['a', 'b', 'c', 'd']],
      rng: sequenceRng(0, 0, 0),
    })
    expect([...proposal.teamA, ...proposal.teamB].sort()).toEqual(['b', 'c'])
  })

  it('bypasses cooldown, degraded fairness, and no-outsider cases without randomness', () => {
    for (const gate of [
      { cooldownRemaining: 1, fairnessReliable: true },
      { cooldownRemaining: 0, fairnessReliable: false },
    ]) {
      expect(run({
        ...gate,
        rng: () => { throw new Error('closed gate must not draw') },
      })).toBe(normal)
    }
    const noOutsider = run({
      normalProposal: { ...normal, resters: [] },
      candidates: candidates.slice(0, 4),
      completedPlayingSets: [['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']],
      rng: () => { throw new Error('no outsider must not draw') },
    })
    expect(noOutsider.rotationWildcard).toBeUndefined()
  })

  it('pins doubles at 25% and singles at 12.5%', () => {
    expect(run({ rng: sequenceRng(0.249999, 0, 0, 0) }).rotationWildcard).toBeDefined()
    expect(run({ rng: sequenceRng(0.25) })).toBe(normal)

    const singles: RoundProposal = {
      mode: 'singles', teamA: ['a'], teamB: ['b'], resters: ['c', 'd', 'e'],
    }
    const single = (draw: number) => run({
      normalProposal: singles,
      completedPlayingSets: [['a', 'b'], ['c', 'd', 'e', 'a']],
      rng: draw < 0.125 ? sequenceRng(draw, 0, 0) : sequenceRng(draw),
    })
    expect(single(0.124999).rotationWildcard).toBeDefined()
    expect(single(0.125)).toBe(singles)
  })

  it('treats regeneration as an independent draw without mutating normal output', () => {
    expect(run({ rng: sequenceRng(0.9) })).toBe(normal)
    expect(run({ rng: sequenceRng(0, 0, 0, 0) }).rotationWildcard).toBeDefined()
    expect(normal.rotationWildcard).toBeUndefined()
  })

  it('makes every normal seat and every eligible outsider uniformly reachable', () => {
    const expanded = [...candidates, candidate('f', 1510)]
    const expandedNormal = { ...normal, resters: ['e', 'f'] }
    const outs = new Set<string>()
    for (const draw of [0, 0.25, 0.5, 0.999999]) {
      const proposal = run({
        normalProposal: expandedNormal,
        candidates: expanded,
        rng: sequenceRng(0, draw, 0, 0),
      })
      outs.add(proposal.rotationWildcard!.exchangedOutId)
      expectOneSeatExchange(proposal)
    }
    expect(outs).toEqual(new Set(['a', 'b', 'c', 'd']))

    const ins = [0, 0.999999].map((draw) => run({
      normalProposal: expandedNormal,
      candidates: expanded,
      rng: sequenceRng(0, 0, draw, 0),
    }).rotationWildcard!.exchangedInId)
    expect(new Set(ins)).toEqual(new Set(['e', 'f']))
  })

  it('excludes voluntary-rest outsiders but permits a prior exchange-out again', () => {
    const expanded = [
      ...candidates.map((item) => item.id === 'e' ? { ...item, volunteerRest: true } : item),
      candidate('f', 1510),
    ]
    const proposal = run({
      normalProposal: { ...normal, resters: ['e', 'f'] },
      candidates: expanded,
      completedPlayingSets: [['d', 'c', 'b', 'a'], ['b', 'c', 'd', 'f']],
      rng: sequenceRng(0, 0, 0.999999, 0),
    })
    expect(proposal.rotationWildcard).toMatchObject({ exchangedOutId: 'a', exchangedInId: 'f' })
  })

  it('is reproducible for the same injected seed', () => {
    const seeded = () => run({ rng: seededRng(7) })
    expect(seeded()).toEqual(seeded())
  })
})

describe('wildcard fixed-playing-set integration', () => {
  it('retains seeded best+25 split variation without reselecting the exchanged set', () => {
    const fixedRatings = [
      candidate('a', 1000), candidate('b', 1010), candidate('c', 1100),
      candidate('d', 1110), candidate('e', 1110),
    ]
    const ratings = Object.fromEntries(fixedRatings.map((item) => [item.id, item.rating]))
    const teams = new Set<string>()
    for (const splitDraw of [0, 0.999999]) {
      const proposal = run({
        candidates: fixedRatings,
        rng: sequenceRng(0, 0.999999, 0, splitDraw),
      })
      expect([...proposal.teamA, ...proposal.teamB].sort()).toEqual(['a', 'b', 'c', 'e'])
      const sum = (ids: string[]) => ids.reduce((total, id) => total + ratings[id]!, 0)
      expect(Math.abs(sum(proposal.teamA) - sum(proposal.teamB))).toBeLessThanOrEqual(25)
      teams.add([...proposal.teamA].sort().join(','))
    }
    expect(teams.size).toBe(2)
  })
})

function run(overrides: Partial<Parameters<typeof applyRotationWildcard>[0]> = {}): RoundProposal {
  return applyRotationWildcard({
    normalProposal: normal,
    candidates,
    completedPlayingSets: doublesHistory,
    cooldownRemaining: 0,
    fairnessReliable: true,
    rng: sequenceRng(0, 0, 0, 0),
    ...overrides,
  })
}

function expectOneSeatExchange(proposal: RoundProposal) {
  const lineage = proposal.rotationWildcard!
  const normalSet = new Set(lineage.normalPlayingIds)
  const finalSet = new Set([...proposal.teamA, ...proposal.teamB])
  expect([...normalSet].filter((id) => !finalSet.has(id))).toEqual([lineage.exchangedOutId])
  expect([...finalSet].filter((id) => !normalSet.has(id))).toEqual([lineage.exchangedInId])
}

function candidate(id: string, rating: number): Candidate {
  return { id, rating, playCount: 0, ratePerHour: 0, consecutivePlayCount: 0 }
}

function sequenceRng(...values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index]
    if (value === undefined) throw new Error('unexpected extra random draw')
    index++
    return value
  }
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

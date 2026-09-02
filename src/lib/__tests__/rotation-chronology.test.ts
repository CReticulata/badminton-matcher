import { describe, expect, it } from 'vitest'
import type { Match, Session } from '../../types'
import { recalcAll } from '../glicko2'
import {
  allocateCompletionSequence,
  assertValidCompletionChronology,
  orderMatchesByCompletionSequence,
  twoRoundsAgoActualPlayingIds,
} from '../rotation-chronology'
import { createUnknownSnapshot } from '../scoring-format'

const format = createUnknownSnapshot('explicit-unknown')

describe('rotation completion chronology', () => {
  it('orders by session-local completion sequence, independent of timestamps and persisted row order', () => {
    const first = match('first', 100, 1)
    const second = match('second', 100, 2)
    const third = match('third', 99, 3)

    expect(orderMatchesByCompletionSequence([third, second, first], 's').map((item) => item.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it.each([
    { label: 'zero', sequences: [0, 1], next: 2 },
    { label: 'non-integer', sequences: [1.5, 2], next: 3 },
    { label: 'duplicate', sequences: [1, 1], next: 2 },
    { label: 'stale high-water', sequences: [1, 2], next: 2 },
    { label: 'non-integer high-water', sequences: [1, 2], next: 3.5 },
  ])('rejects $label chronology', ({ sequences, next }) => {
    const session = { ...baseSession(), nextCompletionSequence: next } as Session
    const matches = sequences.map((sequence, index) => match(`m${index}`, 100, sequence))

    expect(() => assertValidCompletionChronology(session, matches)).toThrow(/completion sequence/i)
  })

  it('rejects unsafe sequence values and never mutates an unadvanceable high-water mark', () => {
    const unsafeSequence = match('unsafe', 100, Number.MAX_SAFE_INTEGER)
    expect(() => assertValidCompletionChronology(
      { ...baseSession(), nextCompletionSequence: Number.MAX_SAFE_INTEGER } as Session,
      [unsafeSequence],
    )).toThrow(/completion sequence/i)

    const session = {
      ...baseSession(),
      nextCompletionSequence: Number.MAX_SAFE_INTEGER - 1,
    } as Session
    expect(() => allocateCompletionSequence(session)).toThrow(/completion sequence/i)
    expect(session.nextCompletionSequence).toBe(Number.MAX_SAFE_INTEGER - 1)
  })

  it('does not change Glicko replay results when chronology fields are added', () => {
    const players = [
      { id: 'a', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
      { id: 'b', name: 'B', color: '#111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
    ]
    const without = [match('one', 100, undefined), match('two', 200, undefined)]
    const withChronology = [match('one', 100, 2), match('two', 200, 1)]

    expect(recalcAll(players, withChronology, [], [])).toEqual(
      recalcAll(players, without, [], []),
    )
  })

  it('looks up t-2 from completion chronology rather than timestamp or row order', () => {
    const first = { ...match('first', 300, 1), teamA: ['a'], teamB: ['b'] }
    const second = { ...match('second', 100, 2), teamA: ['c'], teamB: ['d'] }
    const third = { ...match('third', 100, 3), teamA: ['a'], teamB: ['c'] }

    expect(twoRoundsAgoActualPlayingIds([third, first, second], 's')).toEqual(['c', 'd'])
  })
})

function baseSession(): Session {
  return {
    id: 's',
    name: 's',
    startedAt: 0,
    presentIds: ['a', 'b'],
    leftIds: [],
    volunteerRest: [],
    active: true,
    defaultScoringFormat: format,
  } as Session
}

function match(id: string, at: number, completionSequence: number | undefined): Match {
  return {
    id,
    sessionId: 's',
    at,
    mode: 'singles',
    teamA: ['a'],
    teamB: ['b'],
    scoreA: 21,
    scoreB: 10,
    resters: [],
    scoringFormat: format,
    ...(completionSequence === undefined ? {} : { completionSequence }),
  } as Match
}

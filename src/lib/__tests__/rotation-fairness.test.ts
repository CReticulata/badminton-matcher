import { describe, expect, it } from 'vitest'
import type { AttendanceEvent, Match, Session } from '../../types'
import { projectRotationState } from '../rotation-fairness'
import { createUnknownSnapshot } from '../scoring-format'

const session: Session = { id: 's', name: 's', startedAt: 0, presentIds: [], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') }
const event = (kind: AttendanceEvent['kind'], playerId: string | undefined, at: number, sequence: number, extra = {}): AttendanceEvent => ({ id: `${sequence}`, sessionId: 's', kind, playerId, at, sequence, ...extra } as AttendanceEvent)
const match = (id: string, players: string[], lineage: Record<string, string>): Match => ({ id, sessionId: 's', at: 100, mode: players.length === 2 ? 'singles' : 'doubles', teamA: players.slice(0, players.length / 2), teamB: players.slice(players.length / 2), scoreA: 21, scoreB: 1, resters: [], scoringFormat: createUnknownSnapshot('explicit-unknown'), fairnessPeriodIds: lineage })

describe('projectRotationState', () => {
  it('derives eligible intervals from join, rest, leave and rejoin with injected time', () => {
    const out = projectRotationState(session, [event('join', 'a', 0, 0), event('voluntary-rest-start', 'a', 10, 1), event('voluntary-rest-end', 'a', 20, 2), event('leave', 'a', 30, 3), event('join', 'a', 40, 4)], [], 50)
    expect(out.status).toBe('valid')
    if (out.status === 'valid') {
      expect(out.participantStates.a.eligibleMilliseconds).toBe(30)
      expect(out.participantStates.a.ratePerHour).toBe(0)
      expect(out.participantStates.a.present).toBe(true)
    }
  })

  it('uses stable sequence at same timestamp and validates impossible transitions', () => {
    const valid = projectRotationState(session, [event('join', 'a', 0, 2), event('leave', 'a', 0, 3)], [], 1)
    expect(valid.status).toBe('valid')
    const invalid = projectRotationState(session, [event('leave', 'a', 0, 0)], [], 1)
    expect(invalid).toMatchObject({ status: 'degraded' })
  })

  it('counts singles and doubles using frozen period lineage but separates daily totals', () => {
    const events = [event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1), event('join', 'b', 0, 2), event('fairness-period-started', 'b', 0, 3), event('join', 'c', 0, 4), event('fairness-period-started', 'c', 0, 5), event('join', 'd', 0, 6), event('fairness-period-started', 'd', 0, 7)]
    const out = projectRotationState(session, events, [match('one', ['a', 'b'], { a: '1', b: '3' }), match('two', ['a', 'b', 'c', 'd'], { a: '1', b: '3', c: '5', d: '7' })], 100)
    expect(out).toMatchObject({ status: 'valid' })
    if (out.status === 'valid') expect(out.participantStates.a).toMatchObject({ appearances: 2, dailyAppearances: 2, ratePerHour: 72000 })
  })


  it('rejects a period start before a join and accepts CSV-reordered events by sequence', () => {
    expect(projectRotationState(session, [event('fairness-period-started', 'a', 0, 0)], [], 1)).toMatchObject({ status: 'degraded' })
    const ordered = [event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1), event('leave', 'a', 10, 2)]
    const shuffled = [ordered[2]!, ordered[0]!, ordered[1]!]
    expect(projectRotationState(session, shuffled, [], 10)).toEqual(projectRotationState(session, ordered, [], 10))
  })

  it('starts a reset period immediately and rejects unknown period lineage', () => {
    const events = [event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1), event('fairness-period-started', 'a', 10, 2)]
    const out = projectRotationState(session, events, [], 20)
    expect(out).toMatchObject({ status: 'valid' })
    if (out.status === 'valid') expect(out.participantStates.a).toMatchObject({ periodId: '2', eligibleMilliseconds: 10 })
    expect(projectRotationState(session, events, [match('bad', ['a', 'b'], { a: 'unknown', b: 'x' })], 20)).toMatchObject({ status: 'degraded' })
  })

  it('uses a final recovery boundary as an idempotent authoritative suffix', () => {
    const invalidPrefix = [
      event('leave', 'a', 0, 0, { id: 'duplicate' }),
      event('join', 'a', 0, 0, { id: 'duplicate' }),
    ]
    const boundary = event('fairness-recovery-boundary', undefined, 10, 1, { id: 'repair', presentIds: ['a'], volunteerRestIds: [] })
    const period = event('fairness-period-started', 'a', 10, 2, { id: 'period' })
    const once = projectRotationState(session, [...invalidPrefix, boundary, period], [], 20)
    const repeatedBoundary = event('fairness-recovery-boundary', undefined, 10, 3, { id: 'repair-2', presentIds: ['a'], volunteerRestIds: [] })
    const repeatedPeriod = event('fairness-period-started', 'a', 10, 4, { id: 'period-2' })
    const twice = projectRotationState(session, [...invalidPrefix, boundary, period, repeatedBoundary, repeatedPeriod], [], 20)
    expect(once).toMatchObject({ status: 'valid' })
    expect(twice).toMatchObject({ status: 'valid' })
    if (once.status === 'valid') expect(once.participantStates.a.eligibleMilliseconds).toBe(10)
    if (twice.status === 'valid') expect(twice.participantStates.a.eligibleMilliseconds).toBe(10)
  })

  it('rejects duplicate IDs and incomplete post-boundary lineage without losing daily totals', () => {
    const events = [event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1)]
    expect(projectRotationState(session, [...events, { ...events[1]!, sequence: 2 }], [], 10)).toMatchObject({ status: 'degraded' })
    expect(projectRotationState(session, events, [match('partial', ['a', 'b'], { a: '1' })], 10)).toMatchObject({ status: 'degraded' })
  })

  it('rejects backward-clock sequence order and a match attributed while absent', () => {
    const backward = [event('join', 'a', 0, 2), event('fairness-period-started', 'a', 10, 1)]
    expect(projectRotationState(session, backward, [], 20)).toMatchObject({ status: 'degraded' })

    const events = [
      event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1),
      event('join', 'b', 0, 2), event('fairness-period-started', 'b', 0, 3),
      event('leave', 'a', 10, 4),
    ]
    expect(projectRotationState(session, events, [match('absent', ['a', 'b'], { a: '1', b: '3' })], 100)).toMatchObject({ status: 'degraded' })
  })

  it('keeps forced-unrated, score edits, and deletions inside the frozen period without crossing sessions', () => {
    const events = [
      event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1),
      event('join', 'b', 0, 2), event('fairness-period-started', 'b', 0, 3),
    ]
    const forced = { ...match('forced', ['a', 'b'], { a: '1', b: '3' }), excludedFromRating: true }
    const otherSession = { ...match('other', ['a', 'b'], { a: '1', b: '3' }), sessionId: 'other' }
    const beforeEdit = projectRotationState(session, events, [forced, otherSession], 100)
    const afterEdit = projectRotationState(session, events, [{ ...forced, scoreA: 1, scoreB: 21 }, otherSession], 100)
    const afterDelete = projectRotationState(session, events, [otherSession], 100)
    expect(beforeEdit).toMatchObject({ status: 'valid' })
    expect(afterEdit).toEqual(beforeEdit)
    expect(afterDelete).toMatchObject({ status: 'valid' })
    if (beforeEdit.status === 'valid') expect(beforeEdit.participantStates.a).toMatchObject({ appearances: 1, dailyAppearances: 1 })
    if (afterDelete.status === 'valid') expect(afterDelete.participantStates.a).toMatchObject({ appearances: 0, dailyAppearances: 0 })
  })

  it('attributes a completed queued-reset match to its old period and a cancellation to none', () => {
    const events = [
      event('join', 'a', 0, 0), event('fairness-period-started', 'a', 0, 1),
      event('join', 'b', 0, 2), event('fairness-period-started', 'b', 0, 3),
      event('fairness-reset-requested', 'a', 10, 4, { liveMatchId: 'live' }),
      event('fairness-period-started', 'a', 20, 5),
    ]
    const completed = projectRotationState(session, events, [{ ...match('completed', ['a', 'b'], { a: '1', b: '3' }), at: 15 }], 30)
    const cancelled = projectRotationState(session, events, [], 30)
    expect(completed).toMatchObject({ status: 'valid' })
    expect(cancelled).toMatchObject({ status: 'valid' })
    if (completed.status === 'valid') expect(completed.participantStates.a).toMatchObject({ periodId: '5', appearances: 0, dailyAppearances: 1, eligibleMilliseconds: 10 })
    if (cancelled.status === 'valid') expect(cancelled.participantStates.a).toMatchObject({ appearances: 0, dailyAppearances: 0 })
  })

  it('is deterministic and non-negative across replay tables', () => {
    const rows = [
      [0, 0, 0], [10, 20, 10], [10, 10, 0],
    ] as const
    for (const [joinAt, leaveAt, expected] of rows) {
      const events = [event('join', 'a', joinAt, 0), event('fairness-period-started', 'a', joinAt, 1), event('leave', 'a', leaveAt, 2)]
      const first = projectRotationState(session, events, [], leaveAt)
      const second = projectRotationState(session, [...events].reverse(), [], leaveAt)
      expect(first).toEqual(second)
      expect(first).toMatchObject({ status: 'valid' })
      if (first.status === 'valid') expect(first.participantStates.a.eligibleMilliseconds).toBe(expected)
    }
  })
})

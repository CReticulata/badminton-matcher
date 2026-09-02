import { describe, expect, it } from 'vitest'
import type { AttendanceEvent, Match, Player, Session } from '../../types'
import { countsForRating, recalcAll } from '../glicko2'
import { sessionRatingReport } from '../rating-history'
import { projectRotationState } from '../rotation-fairness'
import { createCatalogSnapshot, isLegalEndpoint } from '../scoring-format'

const ids = ['a', 'b', 'c', 'd', 'e']
const format = createCatalogSnapshot('badminton-21-w2-c30')
const players: Player[] = ids.map((id, index) => ({
  id,
  name: id,
  color: '#111111',
  rating: 1500 + index * 10,
  rd: 350,
  vol: 0.06,
  initialRating: 1500,
  createdAt: 0,
}))
const events: AttendanceEvent[] = ids.flatMap((playerId, index) => [
  { id: `${playerId}-join`, sessionId: 's', kind: 'join', playerId, at: 0, sequence: index * 2 },
  { id: `${playerId}-period`, sessionId: 's', kind: 'fairness-period-started', playerId, at: 0, sequence: index * 2 + 1 },
])
const session: Session = {
  id: 's',
  name: 's',
  startedAt: 0,
  nextCompletionSequence: 2,
  rotationWildcardCooldownRemaining: 2,
  participantIds: ids,
  presentIds: ids,
  leftIds: [],
  volunteerRest: [],
  active: true,
  defaultScoringFormat: format,
  attendanceEvents: events,
  openingRatings: Object.fromEntries(players.map((player) => [
    player.id,
    { rating: player.rating, rd: player.rd, vol: player.vol },
  ])),
}
const manual: Match = {
  id: 'm',
  sessionId: 's',
  at: 100,
  completionSequence: 1,
  mode: 'doubles',
  teamA: ['b', 'c'],
  teamB: ['d', 'e'],
  scoreA: 21,
  scoreB: 10,
  resters: ['a'],
  scoringFormat: format,
  fairnessPeriodIds: Object.fromEntries(['b', 'c', 'd', 'e'].map((id) => [id, `${id}-period`])),
}
const wildcard: Match = {
  ...manual,
  rotationWildcard: {
    schemaVersion: 1,
    normalPlayingIds: ['a', 'b', 'c', 'd'],
    exchangedOutId: 'a',
    exchangedInId: 'e',
  },
}

describe('rotation wildcard origin non-interference', () => {
  it('keeps fairness, Glicko, scoring, and bounded session replay identical to manual origin', () => {
    expect(projectRotationState(session, events, [wildcard], 1_000)).toEqual(
      projectRotationState(session, events, [manual], 1_000),
    )
    expect(recalcAll(players, [wildcard], [], [])).toEqual(
      recalcAll(players, [manual], [], []),
    )
    expect(countsForRating(wildcard)).toBe(countsForRating(manual))
    expect(isLegalEndpoint(wildcard.scoringFormat, wildcard.scoreA, wildcard.scoreB)).toBe(
      isLegalEndpoint(manual.scoringFormat, manual.scoreA, manual.scoreB),
    )
    expect(sessionRatingReport(session, [wildcard])).toEqual(
      sessionRatingReport(session, [manual]),
    )
  })
})

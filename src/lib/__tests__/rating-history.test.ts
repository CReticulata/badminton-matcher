import { describe, expect, it } from 'vitest'
import { sessionRatingReport } from '../rating-history'
import type { Match, RatingBaseline, RatingOverride, Session } from '../../types'

const session: Session = {
  id: 's1',
  name: '測試活動',
  startedAt: 100,
  endedAt: 500,
  openingRatings: {
    a: { rating: 1500, rd: 350, vol: 0.06 },
    b: { rating: 1500, rd: 350, vol: 0.06 },
    c: { rating: 1400, rd: 350, vol: 0.06 },
  },
  participantIds: ['c', 'a', 'b'],
  addedDuringSessionIds: [],
  presentIds: [],
  leftIds: ['c', 'a', 'b'],
  volunteerRest: [],
  active: false,
}

const match = (id: string, at: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match => ({
  id,
  sessionId: 's1',
  at,
  mode: 'singles',
  teamA,
  teamB,
  scoreA,
  scoreB,
  resters: [],
})

describe('sessionRatingReport', () => {
  it('依時間重播比賽並回傳每人的整數單場變動', () => {
    const report = sessionRatingReport(session, [
      match('m2', 300, ['b'], ['a'], 21, 18),
      match('m1', 200, ['a'], ['b'], 21, 18),
    ])!

    expect(report.matchChanges.get('m1')?.a).toBeGreaterThan(0)
    expect(report.matchChanges.get('m1')?.b).toBeLessThan(0)
    expect(report.matchChanges.get('m2')?.b).toBeGreaterThan(0)
    expect(report.matchChanges.get('m2')?.a).toBeLessThan(0)

    for (const changes of report.matchChanges.values()) {
      for (const delta of Object.values(changes)) expect(Number.isInteger(delta)).toBe(true)
    }
  })

  it('摘要包含零場參賽者，依整日變動遞減且同分保留首次加入順序', () => {
    const report = sessionRatingReport(session, [
      match('m1', 200, ['a'], ['b'], 21, 18),
    ])!

    expect(report.summary.map((row) => row.playerId)).toEqual(['a', 'c', 'b'])
    expect(report.summary.find((row) => row.playerId === 'c')).toMatchObject({
      openingRating: 1400,
      endingRating: 1400,
      delta: 0,
      addedDuringSession: false,
    })
  })

  it('重播活動時間窗內的手動覆寫與固化基準事件', () => {
    const overrides: RatingOverride[] = [
      { id: 'o1', playerId: 'a', rating: 1700, at: 200 },
    ]
    const baselines: RatingBaseline[] = [
      { id: 'b1', playerId: 'b', rating: 1300, rd: 120, vol: 0.05, at: 200 },
    ]

    const report = sessionRatingReport(
      session,
      [match('m1', 200, ['a'], ['b'], 21, 18)],
      overrides,
      baselines,
    )!

    expect(report.summary.find((row) => row.playerId === 'a')).toMatchObject({
      openingRating: 1500,
      endingRating: 1700,
      delta: 200,
    })
    expect(report.summary.find((row) => row.playerId === 'b')).toMatchObject({
      openingRating: 1500,
      endingRating: 1300,
      delta: -200,
    })
  })

  it('不納入活動 endedAt 之後的同 session 比賽', () => {
    const report = sessionRatingReport(session, [
      match('late', 600, ['a'], ['b'], 21, 18),
    ])!

    expect(report.matchChanges.has('late')).toBe(false)
    expect(report.summary.every((row) => row.delta === 0)).toBe(true)
  })

  it('開場狀態不完整時不產生活動報告', () => {
    const incomplete: Session = {
      ...session,
      openingRatings: { a: session.openingRatings!.a! },
    }

    expect(sessionRatingReport(incomplete, [])).toBeNull()
  })
})

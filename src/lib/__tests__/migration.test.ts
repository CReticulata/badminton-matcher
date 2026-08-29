import { describe, expect, it } from 'vitest'
import { migrateAppData } from '../migration'
import type { AppData } from '../../types'
import { createUnknownSnapshot } from '../scoring-format'

/** 既有測試不驗證賽制，統一使用明確未知（維持原本的寬鬆比分規則） */
const TEST_FORMAT = createUnknownSnapshot('explicit-unknown')

const oldData = (): AppData => ({
  players: [
    { id: 'a', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 10 },
    { id: 'b', name: 'B', color: '#111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 20 },
    { id: 'late', name: 'Late', color: '#222', rating: 1300, rd: 350, vol: 0.06, initialRating: 1300, createdAt: 150 },
  ],
  sessions: [{
    id: 's1', name: '舊活動', startedAt: 100,
    presentIds: ['a'], leftIds: ['b', 'late'], volunteerRest: [], active: false, defaultScoringFormat: TEST_FORMAT,
  }],
  matches: [{
    id: 'm1', sessionId: 's1', at: 200, mode: 'singles',
    teamA: ['a'], teamB: ['b'], scoreA: 21, scoreB: 18, resters: ['late'], scoringFormat: TEST_FORMAT,
  }],
  overrides: [],
  baselines: [],
})

describe('migrateAppData', () => {
  it('替舊活動補齊開場狀態、參賽順序與活動中新增標記', () => {
    const migrated = migrateAppData(oldData())
    const session = migrated.sessions[0]!

    expect(session.participantIds).toEqual(['a', 'b', 'late'])
    expect(session.participantOrderReliable).toBe(false)
    expect(session.addedDuringSessionIds).toEqual(['late'])
    expect(session.openingRatings).toEqual({
      a: { rating: 1500, rd: 350, vol: 0.06 },
      b: { rating: 1500, rd: 350, vol: 0.06 },
      late: { rating: 1300, rd: 350, vol: 0.06 },
    })
    expect(session.endedAt).toBe(200)
  })

  it('有未知參賽者時不建立開場快照，但保留原活動與比賽', () => {
    const data = oldData()
    data.matches[0]!.teamB = ['missing']

    const migrated = migrateAppData(data)

    expect(migrated.sessions[0]!.openingRatings).toBeUndefined()
    expect(migrated.matches).toHaveLength(1)
  })

  it('只為 active legacy session 在注入時間建立一次暫停狀態正確的 migration suffix', () => {
    const data = oldData()
    data.sessions[0]!.active = true
    data.sessions[0]!.attendanceEvents = []
    data.sessions[0]!.presentIds = ['a', 'a']
    data.sessions[0]!.volunteerRest = ['a', 'a', 'missing']
    const first = migrateAppData(data, 0)
    const events = first.sessions[0]!.attendanceEvents
    expect(events).toMatchObject([
      { kind: 'fairness-recovery-boundary', at: 0, presentIds: ['a'], volunteerRestIds: ['a'] },
      { kind: 'fairness-period-started', playerId: 'a', at: 0 },
    ])
    expect(migrateAppData(first, 9999).sessions[0]!.attendanceEvents).toEqual(events)
    expect(first.matches).toEqual(oldData().matches)
  })

  it('leaves ended fairness-free data byte-semantically unchanged while preserving active Rating authority', () => {
    const ended = oldData()
    ended.sessions[0]!.openingRatings = {
      a: { rating: 1499, rd: 349, vol: 0.059 },
    }
    const original = JSON.parse(JSON.stringify(ended))
    const migratedEnded = migrateAppData(ended, 0)
    expect(migratedEnded.sessions[0]!.attendanceEvents).toBeUndefined()
    expect(migratedEnded.matches).toEqual(original.matches)
    expect(migratedEnded.sessions[0]!.openingRatings).toEqual(original.sessions[0].openingRatings)

    const active = oldData()
    active.sessions[0]!.active = true
    active.sessions[0]!.presentIds = ['a']
    active.sessions[0]!.attendanceEvents = []
    const beforeRatingBytes = JSON.stringify({ players: active.players, matches: active.matches, overrides: active.overrides, baselines: active.baselines })
    const migratedActive = migrateAppData(active, 0)
    expect(JSON.stringify({ players: migratedActive.players, matches: migratedActive.matches, overrides: migratedActive.overrides, baselines: migratedActive.baselines })).toBe(beforeRatingBytes)
  })
})

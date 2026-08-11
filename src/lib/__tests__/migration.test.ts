import { describe, expect, it } from 'vitest'
import { migrateAppData } from '../migration'
import type { AppData } from '../../types'

const oldData = (): AppData => ({
  players: [
    { id: 'a', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 10 },
    { id: 'b', name: 'B', color: '#111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 20 },
    { id: 'late', name: 'Late', color: '#222', rating: 1300, rd: 350, vol: 0.06, initialRating: 1300, createdAt: 150 },
  ],
  sessions: [{
    id: 's1', name: '舊活動', startedAt: 100,
    presentIds: ['a'], leftIds: ['b', 'late'], volunteerRest: [], active: false,
  }],
  matches: [{
    id: 'm1', sessionId: 's1', at: 200, mode: 'singles',
    teamA: ['a'], teamB: ['b'], scoreA: 21, scoreB: 18, resters: ['late'],
  }],
  overrides: [],
  baselines: [],
})

describe('migrateAppData', () => {
  it('替舊活動補齊開場狀態、參賽順序與活動中新增標記', () => {
    const migrated = migrateAppData(oldData())
    const session = migrated.sessions[0]!

    expect(session.participantIds).toEqual(['a', 'b', 'late'])
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
})

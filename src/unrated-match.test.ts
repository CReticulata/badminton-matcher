/**
 * 強制記錄不合賽制的比分：保留紀錄與上場次數，但完全不參與強度計算。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addPlayer,
  data,
  editMatchScore,
  endSession,
  exportCsvText,
  importCsvText,
  ratingReportsBySession,
  sessionStats,
  startMatch,
  startSession,
  submitScore,
  totalStats,
  ui,
} from './store'
import { normalizeAppData } from './lib/app-data-normalization'
import { countsForRating, recalcAll } from './lib/glicko2'
import { createCatalogSnapshot, type ScoringFormatSnapshot } from './lib/scoring-format'

const FMT15 = createCatalogSnapshot('badminton-15-w2-c21')

function resetStore() {
  data.players.splice(0)
  data.sessions.splice(0)
  data.matches.splice(0)
  data.overrides.splice(0)
  data.baselines.splice(0)
  ui.pending = null
  ui.live = null
  ui.scoring = false
  ui.mode = 'doubles'
}

function liveMatch(format: ScoringFormatSnapshot, ids: string[]) {
  ui.pending = { mode: 'singles', teamA: [ids[0]!], teamB: [ids[1]!], resters: ids.slice(2), scoringFormat: format }
  startMatch()
}

const ratings = () => data.players.map((p) => ({ id: p.id, rating: p.rating, rd: p.rd, vol: p.vol }))

beforeEach(resetStore)

describe('強制記錄', () => {
  it('未強制時仍然被擋下', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    expect(submitScore(15, 14)).toMatch(/賽制/)
    expect(data.matches).toHaveLength(0)
  })

  it('強制後寫入紀錄並標記不計入強度，rating 完全不變', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    const before = ratings()
    liveMatch(FMT15, [a.id, b.id])
    expect(submitScore(15, 14, { forceUnrated: true })).toBeNull()

    expect(data.matches).toHaveLength(1)
    expect(data.matches[0]!.excludedFromRating).toBe(true)
    expect(countsForRating(data.matches[0]!)).toBe(false)
    expect(ratings()).toEqual(before)
  })

  it('合法比分強制記錄時不會被誤標為不計入', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    expect(submitScore(15, 9, { forceUnrated: true })).toBeNull()
    expect(data.matches[0]!.excludedFromRating).toBeUndefined()
    expect(data.players[0]!.rating).not.toBe(1500)
  })

  it('強制不能繞過平手與負分', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    expect(submitScore(5, 5, { forceUnrated: true })).toMatch(/平手/)
    expect(submitScore(-1, 5, { forceUnrated: true })).toMatch(/非負整數/)
    expect(data.matches).toHaveLength(0)
  })
})

describe('重播與重算一致', () => {
  it('全量重算不會把不計入的比賽算進去', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 14, { forceUnrated: true })

    const replayed = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    expect(replayed.get(a.id)).toEqual({ rating: 1500, rd: 350, vol: 0.06 })
    expect(replayed.get(b.id)).toEqual({ rating: 1500, rd: 350, vol: 0.06 })
  })

  it('混合計分與不計分時，結果等同只有計分那幾場', () => {
    const build = (withUnrated: boolean) => {
      resetStore()
      const a = addPlayer('A', 1500)
      const b = addPlayer('B', 1500)
      startSession([a.id, b.id], FMT15)
      liveMatch(FMT15, [a.id, b.id])
      submitScore(15, 9)
      if (withUnrated) {
        liveMatch(FMT15, [a.id, b.id])
        submitScore(15, 14, { forceUnrated: true })
      }
      liveMatch(FMT15, [a.id, b.id])
      submitScore(11, 15)
      return ratings().map(({ rating, rd, vol }) => ({ rating, rd, vol }))
    }
    expect(build(true)).toEqual(build(false))
  })

  it('活動摘要不為不計入的比賽產生 delta', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 14, { forceUnrated: true })
    const unratedId = data.matches[0]!.id
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    const ratedId = data.matches[1]!.id
    endSession()

    const report = ratingReportsBySession.value.get(data.sessions[0]!.id)!
    expect(report.matchChanges.has(unratedId)).toBe(false)
    expect(report.matchChanges.get(ratedId)).toBeDefined()
  })
})

describe('仍計入公平輪替的統計', () => {
  it('不計入強度的比賽仍計入上場與休息次數', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    const c = addPlayer('C', 1500)
    startSession([a.id, b.id, c.id], FMT15)
    liveMatch(FMT15, [a.id, b.id, c.id])
    submitScore(15, 14, { forceUnrated: true })

    expect(totalStats.value.get(a.id)).toEqual({ played: 1, rested: 0 })
    expect(totalStats.value.get(c.id)).toEqual({ played: 0, rested: 1 })
    expect(sessionStats.value.get(a.id)?.played).toBe(1)
  })
})

describe('重新載入與匯出', () => {
  it('強制記錄的比賽可以被正規化載回（不得判為資料損毀）', () => {
    const raw = {
      players: [], sessions: [], overrides: [], baselines: [],
      matches: [{
        id: 'm1', sessionId: 's1', at: 1, mode: 'doubles', teamA: ['a'], teamB: ['b'],
        scoreA: 15, scoreB: 14, resters: [],
        scoringFormat: JSON.parse(JSON.stringify(FMT15)),
        excludedFromRating: true,
      }],
    }
    const out = normalizeAppData(raw)
    expect(out.matches[0]!.excludedFromRating).toBe(true)
  })

  it('沒有旗標的不合法比分仍判為損毀', () => {
    const raw = {
      players: [], sessions: [], overrides: [], baselines: [],
      matches: [{
        id: 'm1', sessionId: 's1', at: 1, mode: 'doubles', teamA: ['a'], teamB: ['b'],
        scoreA: 15, scoreB: 14, resters: [],
        scoringFormat: JSON.parse(JSON.stringify(FMT15)),
      }],
    }
    expect(() => normalizeAppData(raw)).toThrow()
  })

  it('CSV round-trip 保留旗標', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 14, { forceUnrated: true })
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    endSession()

    const csv = exportCsvText()
    const before = data.matches.map((m) => [m.id, m.excludedFromRating])
    importCsvText(csv)
    expect(data.matches.map((m) => [m.id, m.excludedFromRating])).toEqual(before)
    expect(data.matches[0]!.excludedFromRating).toBe(true)
    expect(data.matches[1]!.excludedFromRating).toBeUndefined()
  })
})

describe('修改比分時的不變式', () => {
  const setup = () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 14, { forceUnrated: true })
    return data.matches[0]!
  }

  it('改成合法比分後恢復計入強度', () => {
    const m = setup()
    expect(editMatchScore(m.id, 15, 9)).toBeNull()
    expect(m.excludedFromRating).toBeUndefined()
    expect(data.players[0]!.rating).not.toBe(1500)
  })

  it('已排除者改成另一個不合法比分不需重新強制，且維持不計入', () => {
    const m = setup()
    // 20:10 在 15/2/21 下不合法（超過 target 但領先不是 2 分）
    expect(editMatchScore(m.id, 20, 10)).toBeNull()
    expect(m.scoreA).toBe(20)
    expect(m.excludedFromRating).toBe(true)
    expect(data.players[0]!.rating).toBe(1500)
  })

  it('計入中的比賽改成不合法比分仍需強制', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    const m = data.matches[0]!
    expect(editMatchScore(m.id, 15, 14)).toMatch(/賽制/)
    expect(m.scoreB).toBe(9)
    expect(editMatchScore(m.id, 15, 14, { forceUnrated: true })).toBeNull()
    expect(m.excludedFromRating).toBe(true)
    expect(data.players[0]!.rating).toBe(1500)
  })
})

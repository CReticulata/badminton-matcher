/**
 * 賽制對比分寫入／修改的把關，以及對 rating 與重播邊界的非干擾性。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addPlayer,
  archivePlayer,
  data,
  editMatchScore,
  endSession,
  exportCsvText,
  restorePlayer,
  setSessionDefaultScoringFormat,
  startMatch,
  startSession,
  submitScore,
  ui,
} from './store'
import {
  createCatalogSnapshot,
  createCustomSnapshot,
  createDefaultSessionSnapshot,
  createUnknownSnapshot,
  type ScoringFormatSnapshot,
} from './lib/scoring-format'
import { normalizeAppData } from './lib/app-data-normalization'

const FMT15 = createCatalogSnapshot('badminton-15-w2-c21')
const FMT21 = createCatalogSnapshot('badminton-21-w2-c30')
const UNKNOWN = createUnknownSnapshot('explicit-unknown')

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

/** 開一場並直接進入 live，避免依賴 matchmaking 的分組結果 */
function liveMatch(format: ScoringFormatSnapshot, ids: string[]) {
  ui.pending = { mode: 'singles', teamA: [ids[0]!], teamB: [ids[1]!], resters: [], scoringFormat: format }
  startMatch()
}

beforeEach(resetStore)

describe('比分寫入把關', () => {
  it('結構化賽制下不合法的終局在寫入紀錄與 rating 之前被擋下', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    const before = { rating: a.rating, rd: a.rd, vol: a.vol }

    expect(submitScore(15, 14)).toMatch(/賽制/)
    expect(data.matches).toHaveLength(0)
    expect({ rating: a.rating, rd: a.rd, vol: a.vol }).toEqual(before)
    expect(ui.live).not.toBeNull()
  })

  it('合法終局正常寫入並凍結快照', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    expect(submitScore(17, 15)).toBeNull()
    expect(data.matches[0]!.scoringFormat).toEqual(FMT15)
  })

  it('unknown 快照維持既有寬鬆規則', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], UNKNOWN)
    liveMatch(UNKNOWN, [a.id, b.id])
    expect(submitScore(99, 1)).toBeNull()
    liveMatch(UNKNOWN, [a.id, b.id])
    expect(submitScore(3, 3)).toMatch(/平手/)
  })

  it('自訂賽制套用自己的規則', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    const custom = createCustomSnapshot('11 分', { target: 11, winBy: 2, cap: 11 })
    startSession([a.id, b.id], custom)
    liveMatch(custom, [a.id, b.id])
    expect(submitScore(11, 10)).toMatch(/賽制/)
    expect(submitScore(11, 9)).toBeNull()
  })
})

describe('賽制不影響 rating 權威', () => {
  it('相同參賽者與勝負、不同合法賽制，Glicko 結果完全相同', () => {
    const run = (format: ScoringFormatSnapshot, scoreA: number, scoreB: number) => {
      resetStore()
      const a = addPlayer('A', 1500)
      const b = addPlayer('B', 1500)
      startSession([a.id, b.id], format)
      liveMatch(format, [a.id, b.id])
      expect(submitScore(scoreA, scoreB)).toBeNull()
      return data.players.map((p) => ({ rating: p.rating, rd: p.rd, vol: p.vol }))
    }
    expect(run(FMT15, 15, 9)).toEqual(run(FMT21, 21, 9))
    expect(run(FMT15, 15, 9)).toEqual(run(UNKNOWN, 3, 1))
  })
})

describe('歷史修改與重播邊界', () => {
  function twoSessions() {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    endSession()
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 11)
    endSession()
    return { a, b }
  }

  it('不合法的修改被拒絕，且 rating 與紀錄完全不變', () => {
    twoSessions()
    const before = JSON.stringify({ players: data.players, matches: data.matches })
    expect(editMatchScore(data.matches[0]!.id, 15, 14)).toMatch(/賽制/)
    expect(JSON.stringify({ players: data.players, matches: data.matches })).toBe(before)
  })

  it('合法的修改照常重播，且不改變下一活動的開場狀態', () => {
    twoSessions()
    const secondOpening = JSON.stringify(data.sessions[1]!.openingRatings)
    expect(editMatchScore(data.matches[0]!.id, 15, 13)).toBeNull()
    expect(JSON.stringify(data.sessions[1]!.openingRatings)).toBe(secondOpening)
  })

  it('legacy-missing 的比賽維持既有寬鬆規則且快照不變', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], UNKNOWN)
    liveMatch(createUnknownSnapshot('legacy-missing'), [a.id, b.id])
    submitScore(21, 18)
    expect(editMatchScore(data.matches[0]!.id, 30, 2)).toBeNull()
    expect(data.matches[0]!.scoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
  })
})

describe('活動預設是前瞻性的', () => {
  it('變更預設不影響已完成的比賽', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    setSessionDefaultScoringFormat(FMT21)
    expect(data.matches[0]!.scoringFormat).toEqual(FMT15)
    expect(data.sessions[0]!.defaultScoringFormat).toEqual(FMT21)
  })

  it('變更預設不影響已開打的 live 快照', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    setSessionDefaultScoringFormat(FMT21)
    expect(ui.live!.scoringFormat).toEqual(FMT15)
  })
})

describe('封存不影響賽制來源', () => {
  it('封存與還原球員後，歷史快照與匯出內容不變', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], FMT15)
    liveMatch(FMT15, [a.id, b.id])
    submitScore(15, 9)
    endSession()
    const csvBefore = exportCsvText()

    expect(archivePlayer(a.id)).toBe(true)
    expect(data.matches[0]!.scoringFormat).toEqual(FMT15)
    expect(restorePlayer(a.id)).toBe(true)
    expect(exportCsvText()).toBe(csvBefore)
  })
})

describe('新活動的產品預設', () => {
  it('預設是 15/2/21 的目錄快照', () => {
    expect(createDefaultSessionSnapshot()).toEqual(FMT15)
    expect(createDefaultSessionSnapshot().kind).toBe('catalog')
  })

  it('startSession 原樣記錄傳入的賽制，不自行替換', () => {
    const a = addPlayer('A', 1500)
    startSession([a.id], createDefaultSessionSnapshot())
    expect(data.sessions[0]!.defaultScoringFormat).toEqual(FMT15)

    resetStore()
    const b = addPlayer('B', 1500)
    startSession([b.id], FMT21)
    expect(data.sessions[0]!.defaultScoringFormat).toEqual(FMT21)
  })

  it('活動存的是自己的副本，之後改預設不會回頭改到別的活動', () => {
    const a = addPlayer('A', 1500)
    startSession([a.id], FMT15)
    endSession()
    startSession([a.id], FMT15)
    setSessionDefaultScoringFormat(FMT21)
    expect(data.sessions[0]!.defaultScoringFormat).toEqual(FMT15)
    expect(data.sessions[1]!.defaultScoringFormat).toEqual(FMT21)
  })

  it('產品預設不得套用到缺賽制的舊資料', () => {
    const legacy = normalizeAppData({
      players: [], overrides: [], baselines: [],
      sessions: [{ id: 's1', name: '舊活動', startedAt: 1, presentIds: [], leftIds: [], volunteerRest: [], active: false }],
      matches: [{ id: 'm1', sessionId: 's1', at: 2, mode: 'doubles', teamA: ['a'], teamB: ['b'], scoreA: 15, scoreB: 12, resters: [] }],
    })
    // 15:12 在 15/2/21 下完全合法，仍不得因此套用產品預設
    expect(legacy.sessions[0]!.defaultScoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
    expect(legacy.matches[0]!.scoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
  })
})

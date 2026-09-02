/**
 * 清除歷史紀錄功能測試（clearSession / clearAllHistory）。
 * 每個 it 前重置 store 內的 data，避免測試間互相污染（store 為 module 單例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPlayer,
  activePlayers,
  archivedPlayers,
  archivePlayer,
  cancelLiveMatch,
  cancelPending,
  clearAllHistory,
  clearSession,
  data,
  deleteMatch,
  editMatchScore,
  endSession,
  exportCsvText,
  fairnessEvaluationTime,
  fairnessProjection,
  importCsvText,
  joinSession,
  leaveSession,
  overrideRating,
  proposeRound,
  repairFairness,
  resetFairnessPeriod,
  refreshFairnessNow,
  ratingReportsBySession,
  restorePlayer,
  rotationWildcardState,
  startMatch,
  startSession,
  submitScore,
  swapInPending,
  toggleVolunteerRest,
  ui,
} from './store'
import { recalcAll } from './lib/glicko2'
import { createCatalogSnapshot, createUnknownSnapshot } from './lib/scoring-format'

/** 既有測試不驗證賽制，統一使用明確未知（維持原本的寬鬆比分規則） */
const TEST_FORMAT = createUnknownSnapshot('explicit-unknown')

function resetStore() {
  data.players.splice(0)
  data.sessions.splice(0)
  data.matches.splice(0)
  data.overrides.splice(0)
  data.baselines.splice(0)
}

beforeEach(() => {
  resetStore()
  ui.pending = null
  ui.live = null
  ui.mode = 'doubles'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('活動 rating 邊界', () => {
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1])(
    '拒絕不可建立後繼tick的活動開始時間 %s，且不變更既有活動',
    (unsafeNow) => {
      const player = addPlayer('小明', 1500)
      const before = JSON.stringify(data.sessions)
      vi.spyOn(Date, 'now').mockReturnValue(unsafeNow)

      expect(() => startSession([player.id], TEST_FORMAT)).toThrow(/timestamp/i)
      expect(JSON.stringify(data.sessions)).toBe(before)
    },
  )

  it('拒絕非法 refresh／CSV runtime clock，且不改變tick或checkpoint', () => {
    const player = addPlayer('小明', 1500)
    startSession([player.id], TEST_FORMAT)
    const csv = exportCsvText()
    const beforeData = JSON.stringify(data)
    const beforeTick = fairnessEvaluationTime.value
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER - 1)

    expect(() => refreshFairnessNow()).toThrow(/timestamp/i)
    expect(fairnessEvaluationTime.value).toBe(beforeTick)
    expect(() => importCsvText(csv)).toThrow(/timestamp/i)
    expect(JSON.stringify(data)).toBe(beforeData)
    expect(fairnessEvaluationTime.value).toBe(beforeTick)
  })

  it('開始活動時保存所有既有球員狀態，並固定首次加入順序與結束時間', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1700)

    startSession([p1.id], TEST_FORMAT)
    const session = data.sessions[0]!

    expect(session.openingRatings).toEqual({
      [p1.id]: { rating: p1.rating, rd: p1.rd, vol: p1.vol },
      [p2.id]: { rating: p2.rating, rd: p2.rd, vol: p2.vol },
    })
    expect(session.participantIds).toEqual([p1.id])
    expect(session.addedDuringSessionIds).toEqual([])

    const late = addPlayer('遲到新球員', 1300)
    expect(session.openingRatings![late.id]).toEqual({
      rating: late.rating,
      rd: late.rd,
      vol: late.vol,
    })
    expect(session.addedDuringSessionIds).toEqual([late.id])

    joinSession(late.id)
    leaveSession(late.id)
    joinSession(late.id)
    expect(session.participantIds).toEqual([p1.id, late.id])

    endSession()
    expect(session.active).toBe(false)
    expect(session.endedAt).toEqual(expect.any(Number))
  })

  it('系統時鐘在完成比賽後回撥時，活動結束仍涵蓋該比賽', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    startSession([p1.id, p2.id], TEST_FORMAT)
    const session = data.sessions[0]!

    now = 2_000
    ui.live = {
      mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [],
      scoringFormat: TEST_FORMAT, startedAt: now,
    }
    expect(submitScore(21, 10)).toBeNull()
    const completed = data.matches[0]!

    now = 500
    endSession()
    expect(session.endedAt).toBe(2_000)
    expect(session.endedAt).toBeGreaterThanOrEqual(completed.at)
    expect(ratingReportsBySession.value.get(session.id)?.matchChanges.has(completed.id)).toBe(true)
  })

  it('活動進行中禁止手動覆寫 rating', () => {
    const player = addPlayer('小明', 1500)
    startSession([player.id], TEST_FORMAT)

    expect(overrideRating(player.id, 1800)).toBe(false)
    expect(player.rating).toBe(1500)
    expect(data.overrides).toHaveLength(0)

    endSession()
    expect(overrideRating(player.id, 1800)).toBe(true)
    expect(player.rating).toBe(1800)
    expect(data.overrides).toHaveLength(1)
  })

  it('修改前一活動不穿透下一活動，但會更新前一活動的單場變動', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)

    startSession([p1.id, p2.id], TEST_FORMAT)
    const firstSession = data.sessions[0]!
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [], scoringFormat: TEST_FORMAT }
    expect(submitScore(21, 10)).toBeNull()
    const firstMatch = data.matches[0]!
    endSession()

    startSession([p1.id, p2.id], TEST_FORMAT)
    const secondSession = data.sessions[1]!
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [], scoringFormat: TEST_FORMAT }
    expect(submitScore(21, 10)).toBeNull()
    endSession()
    const currentAfterSecond = [p1.rating, p1.rd, p1.vol, p2.rating, p2.rd, p2.vol]
    const originalDelta = ratingReportsBySession.value
      .get(firstSession.id)!
      .matchChanges.get(firstMatch.id)![p1.id]

    expect(editMatchScore(firstMatch.id, 10, 21)).toBeNull()

    expect([p1.rating, p1.rd, p1.vol, p2.rating, p2.rd, p2.vol]).toEqual(currentAfterSecond)
    expect(
      ratingReportsBySession.value
        .get(firstSession.id)!
        .matchChanges.get(firstMatch.id)![p1.id],
    ).toBe(-originalDelta)
    expect(ratingReportsBySession.value.get(secondSession.id)).toBeTruthy()
  })

  it('兩個活動 startedAt 相同（同一毫秒）時，以後建立者為最新活動，修改前一活動仍不穿透', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)

    startSession([p1.id, p2.id], TEST_FORMAT)
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [], scoringFormat: TEST_FORMAT }
    expect(submitScore(21, 10)).toBeNull()
    const firstMatch = data.matches[0]!
    endSession()

    startSession([p1.id, p2.id], TEST_FORMAT)
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [], scoringFormat: TEST_FORMAT }
    expect(submitScore(21, 10)).toBeNull()
    endSession()
    const currentAfterSecond = [p1.rating, p1.rd, p1.vol, p2.rating, p2.rd, p2.vol]

    expect(editMatchScore(firstMatch.id, 10, 21)).toBeNull()
    expect([p1.rating, p1.rd, p1.vol, p2.rating, p2.rd, p2.vol]).toEqual(currentAfterSecond)
  })
})

describe('球員封存', () => {
  it('活動中禁止封存；活動後保留資料並可還原', () => {
    const player = addPlayer('小明', 1500)
    startSession([player.id], TEST_FORMAT)

    expect(archivePlayer(player.id)).toBe(false)
    expect(player.archivedAt).toBeUndefined()

    endSession()
    expect(archivePlayer(player.id)).toBe(true)
    expect(player.archivedAt).toEqual(expect.any(Number))
    expect(data.players.some((candidate) => candidate.id === player.id)).toBe(true)
    expect(activePlayers.value.some((candidate) => candidate.id === player.id)).toBe(false)

    expect(restorePlayer(player.id)).toBe(true)
    expect(player.archivedAt).toBeUndefined()
    expect(activePlayers.value.some((candidate) => candidate.id === player.id)).toBe(true)

    data.players.find((candidate) => candidate.id === player.id)!.archivedAt = 0
    expect(activePlayers.value.some((candidate) => candidate.id === player.id)).toBe(false)
    expect(archivedPlayers.value.some((candidate) => candidate.id === player.id)).toBe(true)
  })
})

describe('proposeRound 連續上場優先級', () => {
  it('上場次數相同時，優先讓連續上場場數最多者休息', () => {
    const players = [...'abcde'].map((name) => addPlayer(name, 1500))
    startSession(players.map((player) => player.id), TEST_FORMAT)
    const sessionId = data.sessions[0]!.id

    // 五場中每人各休息一次，因此當日上場次數相同；
    // 休息順序 a → b → c → d → e，下一場應輪到連打 4 場的 a 休息。
    for (let restIndex = 0; restIndex < players.length; restIndex++) {
      const playing = players.filter((_, index) => index !== restIndex)
      data.matches.push({
        id: `m${restIndex + 1}`,
        sessionId,
        at: restIndex + 1,
        completionSequence: restIndex + 1,
        mode: 'doubles',
        teamA: playing.slice(0, 2).map((player) => player.id),
        teamB: playing.slice(2).map((player) => player.id),
        scoreA: 21,
        scoreB: 15,
        resters: [players[restIndex]!.id],
        scoringFormat: TEST_FORMAT,
      })
    }
    data.sessions[0]!.nextCompletionSequence = players.length + 1
    data.matches.push({
      id: 'other-session-match',
      sessionId: 'other-session',
      at: 100,
      mode: 'singles',
      teamA: [players[0]!.id],
      teamB: [players[4]!.id],
      scoreA: 21,
      scoreB: 18,
      resters: [], scoringFormat: TEST_FORMAT,
    })

    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(proposeRound()).toBe(true)
    expect(ui.pending?.resters).toEqual([players[0]!.id])
  })
})

describe('clearSession / clearAllHistory', () => {
  it('(a) 清除已結束場次＋保留強度：rating/RD/vol 不變，該場次紀錄已刪除', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    startSession([p1.id, p2.id], TEST_FORMAT)
    const sessionId = data.sessions[0]!.id
    // 打幾場
    data.matches.push({
      id: 'm1',
      sessionId,
      at: 1000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 15,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    data.matches.push({
      id: 'm2',
      sessionId,
      at: 2000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 15,
      scoreB: 21,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    // 依歷史全量重算出清除前狀態（等同即時更新後的狀態）
    const before = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    for (const p of data.players) {
      const s = before.get(p.id)!
      p.rating = s.rating
      p.rd = s.rd
      p.vol = s.vol
    }
    const ratingBefore1 = p1.rating
    const rdBefore1 = p1.rd
    const volBefore1 = p1.vol
    const ratingBefore2 = p2.rating

    endSession()
    expect(data.sessions.find((s) => s.id === sessionId)?.active).toBe(false)

    clearSession(sessionId, false)

    expect(data.matches.some((m) => m.sessionId === sessionId)).toBe(false)
    expect(data.sessions.find((s) => s.id === sessionId)).toBeUndefined()
    expect(p1.rating).toBeCloseTo(ratingBefore1, 8)
    expect(p1.rd).toBeCloseTo(rdBefore1, 8)
    expect(p1.vol).toBeCloseTo(volBefore1, 8)
    expect(p2.rating).toBeCloseTo(ratingBefore2, 8)
  })

  it('(b) 清除＋重設強度：結果等於「這些比賽從未發生」時重算的結果', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    const p3 = addPlayer('阿強', 1500)
    startSession([p1.id, p2.id, p3.id], TEST_FORMAT)
    const sessionId = data.sessions[0]!.id
    const firstSessionAt = data.sessions[0]!.startedAt
    data.matches.push({
      id: 'm1',
      sessionId,
      at: firstSessionAt,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 15,
      resters: [p3.id], scoringFormat: TEST_FORMAT,
    })
    // 另一場不受影響的比賽（別的場次）
    startSession([p1.id, p2.id, p3.id], TEST_FORMAT)
    const otherSessionId = data.sessions[1]!.id
    const otherSessionAt = data.sessions[1]!.startedAt
    data.matches.push({
      id: 'm2',
      sessionId: otherSessionId,
      at: otherSessionAt,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p3.id],
      scoreA: 21,
      scoreB: 10,
      resters: [p2.id], scoringFormat: TEST_FORMAT,
    })

    clearSession(sessionId, true)

    // 清除後的 rating 應等於：只剩 m2 時全量重算的結果
    const expected = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    for (const p of data.players) {
      const e = expected.get(p.id)!
      expect(p.rating).toBeCloseTo(e.rating, 8)
      expect(p.rd).toBeCloseTo(e.rd, 8)
    }
    // 沒有寫入 baseline（重設強度不固化）
    expect(data.baselines.length).toBe(0)
    // m1 確實被刪除
    expect(data.matches.some((m) => m.id === 'm1')).toBe(false)
  })

  it('(c) 清除全部歷史：進行中場次保留（場次與出席名單還在），已結束場次被刪除', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)

    startSession([p1.id, p2.id], TEST_FORMAT)
    const endedSessionId = data.sessions[0]!.id
    data.matches.push({
      id: 'm1',
      sessionId: endedSessionId,
      at: 1000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 15,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    endSession()

    startSession([p1.id, p2.id], TEST_FORMAT)
    const activeSessionId = data.sessions[1]!.id
    data.matches.push({
      id: 'm2',
      sessionId: activeSessionId,
      at: 2000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 18,
      resters: [], scoringFormat: TEST_FORMAT,
    })

    clearAllHistory(false)

    // 已結束場次被刪除
    expect(data.sessions.find((s) => s.id === endedSessionId)).toBeUndefined()
    // 進行中場次保留、出席名單仍在
    const activeSession = data.sessions.find((s) => s.id === activeSessionId)
    expect(activeSession).toBeDefined()
    expect(activeSession?.active).toBe(true)
    expect(activeSession?.presentIds).toEqual([p1.id, p2.id])
    // 所有比賽紀錄都被刪除（含進行中場次底下的）
    expect(data.matches.length).toBe(0)
  })

  it('(d) baseline 事件 CSV 匯出/匯入 round-trip 資料一致', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    startSession([p1.id, p2.id], TEST_FORMAT)
    const sessionId = data.sessions[0]!.id
    data.matches.push({
      id: 'm1',
      sessionId,
      at: 1000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 15,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    endSession()
    clearSession(sessionId, false) // 寫入 baseline

    expect(data.baselines.length).toBeGreaterThan(0)
    const beforePlayers = JSON.parse(JSON.stringify(data.players))
    const beforeBaselines = JSON.parse(JSON.stringify(data.baselines))

    const csv = exportCsvText()
    importCsvText(csv)

    expect(data.players).toEqual(beforePlayers)
    expect(data.baselines).toEqual(beforeBaselines)
  })

  it('(e) 清除後又打新比賽，重播序列（override + baseline 混合）多次 recalcAll 結果一致（幂等）', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    startSession([p1.id, p2.id], TEST_FORMAT)
    const sessionId = data.sessions[0]!.id
    data.matches.push({
      id: 'm1',
      sessionId,
      at: 1000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 15,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    endSession()
    clearSession(sessionId, false) // 寫入 baseline（保留強度）

    // 手動覆寫一次
    overrideRating(p2.id, 1600)

    // 又打新比賽（舊場次已結束並被 clearSession 刪除，故新場次會是唯一一筆）
    startSession([p1.id, p2.id], TEST_FORMAT)
    const newSessionId = data.sessions[data.sessions.length - 1]!.id
    data.matches.push({
      id: 'm2',
      sessionId: newSessionId,
      at: 5000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 15,
      scoreB: 21,
      resters: [], scoringFormat: TEST_FORMAT,
    })

    const run1 = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    const run2 = recalcAll(data.players, data.matches, data.overrides, data.baselines)

    for (const p of data.players) {
      const s1 = run1.get(p.id)!
      const s2 = run2.get(p.id)!
      expect(s1.rating).toBeCloseTo(s2.rating, 10)
      expect(s1.rd).toBeCloseTo(s2.rd, 10)
      expect(s1.vol).toBeCloseTo(s2.vol, 10)
    }
  })

  it('(f) 保留強度＝全員固化：未參與被清場次、但與參與者交手過的第三方，分數不變', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    const p3 = addPlayer('阿強', 1500)
    // 場次 A：p1 血洗 p2 多場，把 p1 打高
    startSession([p1.id, p2.id], TEST_FORMAT)
    const sessionA = data.sessions[0]!.id
    for (let i = 0; i < 6; i++) {
      data.matches.push({
        id: `a${i}`,
        sessionId: sessionA,
        at: 1000 + i,
        mode: 'singles',
        teamA: [p1.id],
        teamB: [p2.id],
        scoreA: 21,
        scoreB: 5,
        resters: [], scoringFormat: TEST_FORMAT,
      })
    }
    endSession()
    // 場次 B：高分的 p1 對 p3
    startSession([p1.id, p3.id], TEST_FORMAT)
    const sessionB = data.sessions.find((s) => s.active)!.id
    data.matches.push({
      id: 'b1',
      sessionId: sessionB,
      at: 9000,
      mode: 'singles',
      teamA: [p1.id],
      teamB: [p3.id],
      scoreA: 21,
      scoreB: 5,
      resters: [], scoringFormat: TEST_FORMAT,
    })
    endSession()
    const st = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    for (const p of data.players) {
      const s = st.get(p.id)!
      p.rating = s.rating
      p.rd = s.rd
      p.vol = s.vol
    }
    const p3Before = { rating: p3.rating, rd: p3.rd, vol: p3.vol }

    clearSession(sessionA, false)

    expect(p3.rating).toBeCloseTo(p3Before.rating, 8)
    expect(p3.rd).toBeCloseTo(p3Before.rd, 8)
    expect(p3.vol).toBeCloseTo(p3Before.vol, 8)
    // 全員固化：每位球員都有 baseline
    expect(new Set(data.baselines.map((b) => b.playerId)).size).toBe(data.players.length)
  })

  it('(g) 基準前結凍：清除後修改「早於基準」的比賽比分，強度分數不變（既定語意）', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    const p3 = addPlayer('阿強', 1500)
    startSession([p1.id, p2.id, p3.id], TEST_FORMAT)
    const sessionA = data.sessions[0]!.id
    data.matches.push({
      id: 'a1',
      sessionId: sessionA,
      at: 1000,
      mode: 'singles',
      teamA: [p1.id],
      teamB: [p2.id],
      scoreA: 21,
      scoreB: 19,
      resters: [p3.id], scoringFormat: TEST_FORMAT,
    })
    endSession()
    startSession([p1.id, p2.id, p3.id], TEST_FORMAT)
    const sessionB = data.sessions.find((s) => s.active)!.id
    data.matches.push({
      id: 'b1',
      sessionId: sessionB,
      at: 2000,
      mode: 'singles',
      teamA: [p1.id],
      teamB: [p3.id],
      scoreA: 21,
      scoreB: 19,
      resters: [p2.id], scoringFormat: TEST_FORMAT,
    })
    endSession()
    const st = recalcAll(data.players, data.matches, data.overrides, data.baselines)
    for (const p of data.players) {
      const s = st.get(p.id)!
      p.rating = s.rating
      p.rd = s.rd
      p.vol = s.vol
    }

    clearSession(sessionA, false) // 固化基準（時間必晚於 b1）
    const ratings = data.players.map((p) => p.rating)

    // 修改早於基準的 b1 比分：紀錄更新，但強度分數維持固化值
    const err = editMatchScore('b1', 5, 21)
    expect(err).toBeNull()
    expect(data.matches.find((m) => m.id === 'b1')!.scoreA).toBe(5)
    data.players.forEach((p, i) => expect(p.rating).toBeCloseTo(ratings[i]!, 8))
  })
})

describe('取消進行中的比賽', () => {
  it('作廢 live context，不留下紀錄也不動 rating', () => {
    const ids = ['小明', '阿華', '小美', '阿強'].map((n) => addPlayer(n, 1500).id)
    startSession(ids, TEST_FORMAT)
    expect(proposeRound()).toBe(true)
    startMatch()
    expect(ui.live).not.toBeNull()

    const before = data.players.map((p) => ({ ...p }))
    cancelLiveMatch()

    expect(ui.live).toBeNull()
    expect(ui.scoring).toBe(false)
    expect(data.matches).toHaveLength(0)
    expect(data.players.map((p) => ({ ...p }))).toEqual(before)
  })

  it('取消後可重新產生分組，該場不計入上場次數', () => {
    const ids = ['小明', '阿華', '小美', '阿強', '小陳'].map((n) => addPlayer(n, 1500).id)
    startSession(ids, TEST_FORMAT)
    proposeRound()
    startMatch()
    cancelLiveMatch()

    expect(proposeRound()).toBe(true)
    expect(ui.pending).not.toBeNull()
    expect(data.matches).toHaveLength(0)
  })
})

describe('fairness live lineage', () => {
  it('binds queued reset to a durable live identity and activates it only at cancellation', () => {
    const players = [...'abcd'].map((name) => addPlayer(name, 1500))
    startSession(players.map((player) => player.id), TEST_FORMAT)
    expect(proposeRound()).toBe(true)
    startMatch()
    const session = data.sessions[0]!
    const liveId = ui.live?.liveMatchId
    expect(liveId).toEqual(expect.any(String))
    expect(session.liveMatch).toEqual(ui.live)
    resetFairnessPeriod(players[0]!.id)
    expect(session.attendanceEvents?.at(-1)).toMatchObject({ kind: 'fairness-reset-requested', playerId: players[0]!.id, liveMatchId: liveId })
    const beforeLeave = session.attendanceEvents?.length
    leaveSession(players[0]!.id)
    expect(session.attendanceEvents).toHaveLength(beforeLeave!)
    expect(session.presentIds).toContain(players[0]!.id)
    cancelLiveMatch()
    expect(session.liveMatch).toBeUndefined()
    expect(session.attendanceEvents?.at(-1)).toMatchObject({ kind: 'fairness-period-started', playerId: players[0]!.id })
  })

  it('uses event projection rather than stale compatibility attendance lists', () => {
    const players = [...'abcd'].map((name) => addPlayer(name, 1500))
    startSession(players.map((player) => player.id), TEST_FORMAT)
    const session = data.sessions[0]!
    session.presentIds = players.slice(0, 3).map((player) => player.id)
    session.volunteerRest = [players[0]!.id]

    expect(proposeRound()).toBe(true)
    expect(new Set([...(ui.pending?.teamA ?? []), ...(ui.pending?.teamB ?? [])])).toEqual(new Set(players.map((player) => player.id)))
    expect(ui.pending?.resters).toEqual([])
  })

  it('appends sequenced eligibility transitions, freezes previews across time, and persists manual-swap lineage', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const players = [...'abcde'].map((name) => addPlayer(name, 1500))
    startSession(players.slice(0, 4).map((player) => player.id), TEST_FORMAT)
    const session = data.sessions[0]!
    expect(session.attendanceEvents?.map((event) => event.kind)).toEqual([
      'join', 'fairness-period-started', 'join', 'fairness-period-started',
      'join', 'fairness-period-started', 'join', 'fairness-period-started',
    ])
    expect(proposeRound()).toBe(true)
    const preview = ui.pending
    now += 60_000
    refreshFairnessNow()
    expect(ui.pending).toBe(preview)

    joinSession(players[4]!.id)
    expect(ui.pending).toBeNull()
    toggleVolunteerRest(players[4]!.id)
    toggleVolunteerRest(players[4]!.id)
    leaveSession(players[4]!.id)
    joinSession(players[4]!.id)
    const appended = session.attendanceEvents!.slice(8)
    expect(appended.map((event) => event.kind)).toEqual([
      'join', 'fairness-period-started', 'voluntary-rest-start', 'voluntary-rest-end', 'leave', 'join',
    ])
    expect(appended.map((event) => event.sequence)).toEqual([8, 9, 10, 11, 12, 13])

    expect(proposeRound()).toBe(true)
    const playing = [...ui.pending!.teamA, ...ui.pending!.teamB]
    const rest = ui.pending!.resters[0]!
    swapInPending(playing[0]!, rest)
    startMatch()
    const finalLineup = [...ui.live!.teamA, ...ui.live!.teamB]
    const lineage = ui.live!.fairnessPeriodIds
    expect(Object.keys(lineage ?? {}).sort()).toEqual([...finalLineup].sort())
    expect(submitScore(21, 10)).toBeNull()
    expect(data.matches[0]!.fairnessPeriodIds).toEqual(lineage)
    const matchId = data.matches[0]!.id
    expect(editMatchScore(matchId, 10, 21)).toBeNull()
    expect(data.matches[0]!.fairnessPeriodIds).toEqual(lineage)
    deleteMatch(matchId)
    expect(data.matches).toHaveLength(0)
    expect(session.attendanceEvents?.map((event) => event.sequence)).toEqual([...Array(14).keys()])
  })

  it('allocates completion sequence from a persisted high-water mark without timestamp ties or gap reuse', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], TEST_FORMAT)
    const session = data.sessions[0]!
    expect(session.nextCompletionSequence).toBe(1)

    const complete = () => {
      ui.live = {
        mode: 'singles',
        teamA: [a.id],
        teamB: [b.id],
        resters: [],
        scoringFormat: TEST_FORMAT,
      }
      expect(submitScore(21, 10)).toBeNull()
    }

    complete()
    complete()
    expect(data.matches.map((match) => match.completionSequence)).toEqual([1, 2])
    expect(data.matches.map((match) => match.at)).toEqual([10_000, 10_000])
    expect(session.nextCompletionSequence).toBe(3)

    const firstId = data.matches[0]!.id
    expect(editMatchScore(firstId, 10, 21)).toBeNull()
    expect(data.matches[0]!.completionSequence).toBe(1)
    deleteMatch(data.matches[1]!.id)
    expect(session.nextCompletionSequence).toBe(3)

    complete()
    expect(data.matches.map((match) => match.completionSequence)).toEqual([1, 3])
    expect(session.nextCompletionSequence).toBe(4)
  })
})

describe('rotation wildcard store lineage', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'] as const

  function startPlayers(present: readonly (typeof ids)[number][] = ids) {
    const players = Object.fromEntries(ids.map((id) => [id, addPlayer(id, 1500)]))
    startSession(present.map((id) => players[id].id), TEST_FORMAT)
    return players
  }

  function setPendingLineage(players: ReturnType<typeof startPlayers>) {
    const id = (key: typeof ids[number]) => players[key].id
    ui.pending = {
      mode: 'doubles',
      teamA: [id('b'), id('c')],
      teamB: [id('d'), id('e')],
      resters: [id('a'), id('f')],
      scoringFormat: TEST_FORMAT,
      rotationWildcard: {
        schemaVersion: 1,
        normalPlayingIds: [id('a'), id('b'), id('c'), id('d')].sort(),
        exchangedOutId: id('a'),
        exchangedInId: id('e'),
      },
    }
  }

  it('attaches proposal lineage from completion chronology in reliable fairness', () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const players = startPlayers(['a', 'b', 'c', 'd'])
    const session = data.sessions[0]!
    now = 3_599_000
    joinSession(players.e.id)
    now = 3_600_100

    const period = (playerId: string) => session.attendanceEvents!
      .filter((event) => event.playerId === playerId && event.kind === 'fairness-period-started')
      .at(-1)!.id
    const makeMatch = (
      id: string,
      sequence: number,
      at: number,
      playing: string[],
      resters: string[],
    ) => ({
      id,
      sessionId: session.id,
      at,
      completionSequence: sequence,
      mode: 'doubles' as const,
      teamA: playing.slice(0, 2),
      teamB: playing.slice(2),
      scoreA: 21,
      scoreB: 10,
      resters,
      scoringFormat: TEST_FORMAT,
      fairnessPeriodIds: Object.fromEntries(playing.map((playerId) => [playerId, period(playerId)])),
    })
    data.matches.push(
      makeMatch('m1', 1, 1_000, [players.a.id, players.b.id, players.c.id, players.d.id], [players.e.id]),
      makeMatch('m2', 2, 3_600_000, [players.a.id, players.b.id, players.c.id, players.e.id], [players.d.id]),
    )
    session.nextCompletionSequence = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(proposeRound()).toBe(true)
    expect(ui.pending?.rotationWildcard).toMatchObject({
      schemaVersion: 1,
      normalPlayingIds: [players.a.id, players.b.id, players.c.id, players.d.id].sort(),
      exchangedOutId: expect.any(String),
      exchangedInId: players.e.id,
    })
  })

  it('preserves lineage for team-only swaps and clears it for every final-set violation', () => {
    const players = startPlayers()
    const id = (key: typeof ids[number]) => players[key].id

    setPendingLineage(players)
    swapInPending(id('b'), id('d'))
    expect(ui.pending?.rotationWildcard).toBeDefined()

    setPendingLineage(players)
    swapInPending(id('e'), id('f'))
    expect(ui.pending?.rotationWildcard).toBeUndefined()

    setPendingLineage(players)
    swapInPending(id('e'), id('a'))
    expect(ui.pending?.rotationWildcard).toBeUndefined()

    setPendingLineage(players)
    swapInPending(id('b'), id('f'))
    expect(ui.pending?.rotationWildcard).toBeUndefined()

    ui.pending = {
      mode: 'doubles', teamA: [id('a'), id('b')], teamB: [id('c'), id('d')],
      resters: [id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    swapInPending(id('a'), id('e'))
    expect(ui.pending?.rotationWildcard).toBeUndefined()
    expect([...ui.pending!.teamA, ...ui.pending!.teamB]).toContain(id('e'))
  })

  it('freezes only valid lineage at start, copies it on completion, and never fabricates it on cancellation', () => {
    const players = startPlayers()
    setPendingLineage(players)
    const expected = JSON.parse(JSON.stringify(ui.pending!.rotationWildcard))

    startMatch()
    expect(ui.live?.rotationWildcard).toEqual(expected)
    expect(data.sessions[0]!.liveMatch?.rotationWildcard).toEqual(expected)
    expect(data.matches).toHaveLength(0)
    expect(submitScore(21, 10)).toBeNull()
    expect(data.matches[0]!.rotationWildcard).toEqual(expected)
    expect(editMatchScore(data.matches[0]!.id, 10, 21)).toBeNull()
    expect(data.matches[0]!.rotationWildcard).toEqual(expected)

    setPendingLineage(players)
    startMatch()
    cancelLiveMatch()
    expect(data.matches).toHaveLength(1)
    expect(ui.live).toBeNull()
    expect(data.sessions[0]!.liveMatch).toBeUndefined()
  })

  it('sets cooldown to two only on valid wildcard completion and shares reliable decrements across modes', () => {
    const players = startPlayers()
    const session = data.sessions[0]!
    const id = (key: typeof ids[number]) => players[key].id
    setPendingLineage(players)
    startMatch()
    expect(session.rotationWildcardCooldownRemaining).toBe(0)
    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)

    expect(proposeRound()).toBe(true)
    expect(session.rotationWildcardCooldownRemaining).toBe(2)
    cancelPending()
    ui.pending = {
      mode: 'singles', teamA: [id('a')], teamB: [id('b')],
      resters: [id('c'), id('d'), id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    startMatch()
    cancelLiveMatch()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)

    ui.pending = {
      mode: 'singles', teamA: [id('a')], teamB: [id('b')],
      resters: [id('c'), id('d'), id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    startMatch()
    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(1)

    ui.pending = {
      mode: 'doubles', teamA: [id('a'), id('b')], teamB: [id('c'), id('d')],
      resters: [id('e'), id('f')],
      scoringFormat: createCatalogSnapshot('badminton-15-w2-c21'),
    }
    startMatch()
    expect(submitScore(10, 9, { forceUnrated: true })).toBeNull()
    expect(data.matches.at(-1)!.excludedFromRating).toBe(true)
    expect(session.rotationWildcardCooldownRemaining).toBe(0)
  })

  it('never rewinds cooldown from score edits/deletions and resets only for a new activity', () => {
    const players = startPlayers()
    const firstSession = data.sessions[0]!
    setPendingLineage(players)
    startMatch()
    expect(submitScore(21, 10)).toBeNull()
    const wildcardMatchId = data.matches[0]!.id
    expect(firstSession.rotationWildcardCooldownRemaining).toBe(2)

    expect(editMatchScore(wildcardMatchId, 10, 21)).toBeNull()
    expect(firstSession.rotationWildcardCooldownRemaining).toBe(2)
    deleteMatch(wildcardMatchId)
    expect(firstSession.rotationWildcardCooldownRemaining).toBe(2)

    endSession()
    expect(firstSession.rotationWildcardCooldownRemaining).toBe(2)
    startSession(Object.values(players).map((player) => player.id), TEST_FORMAT)
    expect(data.sessions.at(-1)!.rotationWildcardCooldownRemaining).toBe(0)
    expect(firstSession.rotationWildcardCooldownRemaining).toBe(2)
  })

  it('pauses draws and cooldown in degraded fallback, then resumes the exact count after repair', () => {
    const players = startPlayers()
    const session = data.sessions[0]!
    const id = (key: typeof ids[number]) => players[key].id
    session.rotationWildcardCooldownRemaining = 2
    session.attendanceEvents!.push({
      ...session.attendanceEvents![0]!,
      sequence: session.attendanceEvents!.length,
    })
    refreshFairnessNow()
    expect(fairnessProjection.value).toMatchObject({ status: 'degraded' })
    expect(rotationWildcardState.value).toMatchObject({
      status: 'paused', reason: 'fairness-degraded', remaining: 2,
    })

    expect(proposeRound()).toBe(true)
    expect(ui.pending?.rotationWildcard).toBeUndefined()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)
    cancelPending()
    ui.pending = {
      mode: 'singles', teamA: [id('a')], teamB: [id('b')],
      resters: [id('c'), id('d'), id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    startMatch()
    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)

    expect(repairFairness()).toBe(true)
    expect(fairnessProjection.value).toMatchObject({ status: 'valid' })
    expect(rotationWildcardState.value).toMatchObject({ status: 'cooldown', remaining: 2 })
    ui.pending = {
      mode: 'singles', teamA: [id('a')], teamB: [id('b')],
      resters: [id('c'), id('d'), id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    startMatch()
    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(1)
  })

  it('sets cooldown two when a valid wildcard live match degrades before completion, then keeps it paused', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const players = startPlayers()
    const session = data.sessions[0]!
    const id = (key: typeof ids[number]) => players[key].id
    setPendingLineage(players)
    startMatch()
    session.attendanceEvents!.push({
      ...session.attendanceEvents![0]!,
      sequence: session.attendanceEvents!.length,
    })
    refreshFairnessNow()
    expect(rotationWildcardState.value).toMatchObject({ status: 'paused' })

    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)
    ui.pending = {
      mode: 'singles', teamA: [id('a')], teamB: [id('b')],
      resters: [id('c'), id('d'), id('e'), id('f')], scoringFormat: TEST_FORMAT,
    }
    startMatch()
    expect(submitScore(21, 10)).toBeNull()
    expect(session.rotationWildcardCooldownRemaining).toBe(2)

    const preRepairMatchAt = data.matches.at(-1)!.at
    expect(repairFairness()).toBe(true)
    const appliedBoundary = session.attendanceEvents!
      .filter((event) => event.kind === 'fairness-recovery-boundary' && !event.liveMatchId)
      .at(-1)!
    expect(appliedBoundary.at).toBeGreaterThan(preRepairMatchAt)
    ui.mode = 'singles'
    expect(proposeRound()).toBe(true)
    startMatch()
    expect(Object.keys(ui.live?.fairnessPeriodIds ?? {})).toHaveLength(2)
    expect(submitScore(21, 10)).toBeNull()
    expect(fairnessProjection.value).toEqual({
      status: 'valid',
      participantStates: expect.any(Object),
    })
    const repairedMatch = data.matches.at(-1)!
    if (fairnessProjection.value?.status !== 'valid') throw new Error('expected valid fairness projection')
    for (const playerId of [...repairedMatch.teamA, ...repairedMatch.teamB]) {
      expect(fairnessProjection.value.participantStates[playerId]?.appearances).toBe(1)
    }
    expect(session.rotationWildcardCooldownRemaining).toBe(1)
  })

  it('does not advance trusted fairness time to persisted future events outside explicit repair', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const players = startPlayers()
    const session = data.sessions[0]!
    const restingId = players.f.id
    session.attendanceEvents!.push({
      id: 'future-rest-start',
      sessionId: session.id,
      kind: 'voluntary-rest-start',
      playerId: restingId,
      at: 5_000,
      sequence: session.attendanceEvents!.length,
    })
    session.volunteerRest.push(restingId)
    refreshFairnessNow()
    expect(fairnessProjection.value).toMatchObject({
      status: 'degraded', reason: 'future attendance event',
    })
    const futureCheckpoint = exportCsvText()

    toggleVolunteerRest(restingId)
    expect(session.attendanceEvents!.at(-1)!.at).toBe(1_000)
    expect(fairnessProjection.value).toMatchObject({ status: 'degraded' })

    expect(repairFairness()).toBe(true)
    const boundary = session.attendanceEvents!
      .filter((event) => event.kind === 'fairness-recovery-boundary' && !event.liveMatchId)
      .at(-1)!
    expect(boundary.at).toBeGreaterThan(5_000)
    expect(fairnessProjection.value).toMatchObject({ status: 'valid' })

    importCsvText(futureCheckpoint)
    expect(fairnessProjection.value).toMatchObject({
      status: 'degraded', reason: 'future attendance event',
    })
  })

  it('never completes before the trusted live start when the wall clock moves backward', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const players = startPlayers()
    setPendingLineage(players)
    now = 2_000
    startMatch()
    expect(ui.live?.startedAt).toBe(2_000)

    now = 500
    expect(submitScore(21, 10)).toBeNull()
    expect(data.matches.at(-1)!.at).toBe(2_000)
  })
})

describe('CSV rotation checkpoint overwrite', () => {
  it('restores an older cooldown/high-water checkpoint and performs zero partial replacement on corruption', () => {
    const a = addPlayer('A', 1500)
    const b = addPlayer('B', 1500)
    startSession([a.id, b.id], TEST_FORMAT)
    const session = data.sessions[0]!
    const complete = () => {
      ui.live = {
        mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [],
        scoringFormat: TEST_FORMAT,
      }
      expect(submitScore(21, 10)).toBeNull()
    }
    complete()
    complete()
    session.rotationWildcardCooldownRemaining = 1
    const expectedSessionId = session.id
    const backup = exportCsvText()
    const firstMatch = { ...data.matches[0]! }

    session.rotationWildcardCooldownRemaining = 2
    session.nextCompletionSequence = 9
    addPlayer('newer-local-only', 1500)
    importCsvText(backup)

    const restored = data.sessions.find((item) => item.id === expectedSessionId)!
    expect(restored.rotationWildcardCooldownRemaining).toBe(1)
    expect(restored.nextCompletionSequence).toBe(3)
    expect(data.matches.map((match) => match.completionSequence)).toEqual([1, 2])
    expect(data.players.some((player) => player.name === 'newer-local-only')).toBe(false)

    const before = JSON.stringify(data)
    const malformed = backup.replace(
      `${firstMatch.id},${firstMatch.sessionId},${firstMatch.at},1,`,
      `${firstMatch.id},${firstMatch.sessionId},${firstMatch.at},0,`,
    )
    expect(malformed).not.toBe(backup)
    expect(() => importCsvText(malformed)).toThrow(/completion sequence/i)
    expect(JSON.stringify(data)).toBe(before)
  })
})

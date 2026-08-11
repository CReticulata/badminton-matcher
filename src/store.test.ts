/**
 * 清除歷史紀錄功能測試（clearSession / clearAllHistory）。
 * 每個 it 前重置 store 內的 data，避免測試間互相污染（store 為 module 單例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPlayer,
  clearAllHistory,
  clearSession,
  data,
  editMatchScore,
  endSession,
  exportCsvText,
  importCsvText,
  joinSession,
  leaveSession,
  overrideRating,
  proposeRound,
  ratingReportsBySession,
  startSession,
  submitScore,
  ui,
} from './store'
import { recalcAll } from './lib/glicko2'

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
  it('開始活動時保存所有既有球員狀態，並固定首次加入順序與結束時間', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1700)

    startSession([p1.id])
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

  it('活動進行中禁止手動覆寫 rating', () => {
    const player = addPlayer('小明', 1500)
    startSession([player.id])

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

    startSession([p1.id, p2.id])
    const firstSession = data.sessions[0]!
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [] }
    expect(submitScore(21, 10)).toBeNull()
    const firstMatch = data.matches[0]!
    endSession()

    startSession([p1.id, p2.id])
    const secondSession = data.sessions[1]!
    ui.live = { mode: 'singles', teamA: [p1.id], teamB: [p2.id], resters: [] }
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
})

describe('proposeRound 連續上場優先級', () => {
  it('上場次數相同時，優先讓連續上場場數最多者休息', () => {
    const players = [...'abcde'].map((name) => addPlayer(name, 1500))
    startSession(players.map((player) => player.id))
    const sessionId = data.sessions[0]!.id

    // 五場中每人各休息一次，因此當日上場次數相同；
    // 休息順序 a → b → c → d → e，下一場應輪到連打 4 場的 a 休息。
    for (let restIndex = 0; restIndex < players.length; restIndex++) {
      const playing = players.filter((_, index) => index !== restIndex)
      data.matches.push({
        id: `m${restIndex + 1}`,
        sessionId,
        at: restIndex + 1,
        mode: 'doubles',
        teamA: playing.slice(0, 2).map((player) => player.id),
        teamB: playing.slice(2).map((player) => player.id),
        scoreA: 21,
        scoreB: 15,
        resters: [players[restIndex]!.id],
      })
    }
    data.matches.push({
      id: 'other-session-match',
      sessionId: 'other-session',
      at: 100,
      mode: 'singles',
      teamA: [players[0]!.id],
      teamB: [players[4]!.id],
      scoreA: 21,
      scoreB: 18,
      resters: [],
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
    startSession([p1.id, p2.id])
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
      resters: [],
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
      resters: [],
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
    startSession([p1.id, p2.id, p3.id])
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
      resters: [p3.id],
    })
    // 另一場不受影響的比賽（別的場次）
    startSession([p1.id, p2.id, p3.id])
    const otherSessionId = data.sessions[1]!.id
    data.matches.push({
      id: 'm2',
      sessionId: otherSessionId,
      at: 2000,
      mode: 'doubles',
      teamA: [p1.id],
      teamB: [p3.id],
      scoreA: 21,
      scoreB: 10,
      resters: [p2.id],
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

    startSession([p1.id, p2.id])
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
      resters: [],
    })
    endSession()

    startSession([p1.id, p2.id])
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
      resters: [],
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
    startSession([p1.id, p2.id])
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
      resters: [],
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
    startSession([p1.id, p2.id])
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
      resters: [],
    })
    endSession()
    clearSession(sessionId, false) // 寫入 baseline（保留強度）

    // 手動覆寫一次
    overrideRating(p2.id, 1600)

    // 又打新比賽（舊場次已結束並被 clearSession 刪除，故新場次會是唯一一筆）
    startSession([p1.id, p2.id])
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
      resters: [],
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
    startSession([p1.id, p2.id])
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
        resters: [],
      })
    }
    endSession()
    // 場次 B：高分的 p1 對 p3
    startSession([p1.id, p3.id])
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
      resters: [],
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
    startSession([p1.id, p2.id, p3.id])
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
      resters: [p3.id],
    })
    endSession()
    startSession([p1.id, p2.id, p3.id])
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
      resters: [p2.id],
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

/**
 * 清除歷史紀錄功能測試（clearSession / clearAllHistory）。
 * 每個 it 前重置 store 內的 data，避免測試間互相污染（store 為 module 單例）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPlayer,
  clearAllHistory,
  clearSession,
  data,
  editMatchScore,
  endSession,
  exportCsvText,
  importCsvText,
  overrideRating,
  proposeRound,
  resetPendingScoringFormat,
  setPendingScoringFormat,
  setSessionDefaultScoringFormat,
  startMatch,
  startSession,
  submitScore,
  ui,
} from './store'
import { recalcAll } from './lib/glicko2'
import { exportCsv } from './lib/csv'
import { createCatalogSnapshot, createCustomSnapshot, createUnknownSnapshot, type ScoringFormatSnapshot } from './lib/scoring-format'

function resetStore() {
  data.players.splice(0)
  data.sessions.splice(0)
  data.matches.splice(0)
  data.overrides.splice(0)
  data.baselines.splice(0)
}

beforeEach(() => {
  resetStore()
})

describe('clearSession / clearAllHistory', () => {
  it('(a) 清除已結束場次＋保留強度：rating/RD/vol 不變，該場次紀錄已刪除', () => {
    const p1 = addPlayer('小明', 1500)
    const p2 = addPlayer('阿華', 1500)
    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
    startSession([p1.id, p2.id, p3.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
    })
    // 另一場不受影響的比賽（別的場次）
    startSession([p1.id, p2.id, p3.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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

    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
    })
    endSession()

    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
    })
    endSession()
    clearSession(sessionId, false) // 寫入 baseline（保留強度）

    // 手動覆寫一次
    overrideRating(p2.id, 1600)

    // 又打新比賽（舊場次已結束並被 clearSession 刪除，故新場次會是唯一一筆）
    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
    startSession([p1.id, p2.id], createUnknownSnapshot('explicit-unknown'))
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
        scoringFormat: createUnknownSnapshot('explicit-unknown'),
      })
    }
    endSession()
    // 場次 B：高分的 p1 對 p3
    startSession([p1.id, p3.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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
    startSession([p1.id, p2.id, p3.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
    })
    endSession()
    startSession([p1.id, p2.id, p3.id], createUnknownSnapshot('explicit-unknown'))
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
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
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

class MemoryStorage {
  private readonly values = new Map<string, string>()
  failWrites = false
  failKey: string | null = null
  forceBackupReadbackMismatch = false
  onSet: ((key: string, value: string) => void) | undefined
  private backupReads = 0

  getItem(key: string): string | null {
    if (key === BACKUP_KEY) {
      this.backupReads++
      if (this.forceBackupReadbackMismatch && this.backupReads > 1) return 'wrong-bytes'
    }
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites || key === this.failKey) throw new Error('quota exceeded')
    this.onSet?.(key, value)
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const STORAGE_KEY = 'badminton-matcher:v1'
const BACKUP_KEY = 'badminton-matcher:pre-scoring-format-v1'
const legacyRaw = JSON.stringify({ players: [], sessions: [], matches: [], overrides: [], baselines: [] })
const malformedRaw = JSON.stringify({ players: [], sessions: [{ id: 's', defaultScoringFormat: { kind: 'unknown' } }], matches: [], overrides: [], baselines: [] })

async function loadStore(storage: MemoryStorage) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  return import('./store')
}

describe('scoring-format local-storage recovery boundary', () => {
  it('backs up an existing active value byte-for-byte once before its enriched write', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, legacyRaw)
    const store = await loadStore(storage)

    expect(storage.getItem(BACKUP_KEY)).toBe(legacyRaw)
    expect(store.recoveryState.value).toBe('ready')
    store.addPlayer('backup-trigger', 1500)
    await Promise.resolve()
    expect(storage.getItem(STORAGE_KEY)).not.toBe(legacyRaw)
    expect(storage.getItem(BACKUP_KEY)).toBe(legacyRaw)
  })

  it('does not create or overwrite a backup when none is needed or one already exists', async () => {
    const absent = new MemoryStorage()
    await loadStore(absent)
    expect(absent.getItem(BACKUP_KEY)).toBeNull()

    const existing = new MemoryStorage()
    existing.setItem(STORAGE_KEY, legacyRaw)
    existing.setItem(BACKUP_KEY, 'previous-preserved-raw')
    await loadStore(existing)
    expect(existing.getItem(BACKUP_KEY)).toBe('previous-preserved-raw')
  })

  it('preserves malformed active raw, blocks writes and mutations, and exposes it for download', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, malformedRaw)
    const store = await loadStore(storage)

    expect(store.recoveryState.value).toBe('blocked')
    expect(store.blockedRawData.value).toBe(malformedRaw)
    expect(storage.getItem(STORAGE_KEY)).toBe(malformedRaw)
    expect(store.addPlayer('must-not-write', 1500)).toBeUndefined()
    expect(store.data.players).toEqual([])
    await Promise.resolve()
    expect(storage.getItem(STORAGE_KEY)).toBe(malformedRaw)
  })

  it('enters blocked recovery when a normal post-startup persistence write fails', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, legacyRaw)
    const store = await loadStore(storage)
    storage.failKey = STORAGE_KEY

    store.addPlayer('not-persisted', 1500)
    await Promise.resolve(); await Promise.resolve()
    expect(store.recoveryState.value).toBe('blocked')
    expect(store.blockedRawData.value).toBe(legacyRaw)
    expect(storage.getItem(STORAGE_KEY)).toBe(legacyRaw)
    const countAfterFailure = store.data.players.length
    expect(store.addPlayer('must-be-blocked', 1500)).toBeUndefined()
    expect(store.data.players).toHaveLength(countAfterFailure)
  })

  it('blocks on backup write or readback failure without overwriting active raw', async () => {
    const quota = new MemoryStorage()
    quota.setItem(STORAGE_KEY, legacyRaw)
    quota.failWrites = true
    const quotaStore = await loadStore(quota)
    expect(quotaStore.recoveryState.value).toBe('blocked')
    expect(quota.getItem(STORAGE_KEY)).toBe(legacyRaw)

    const mismatch = new MemoryStorage()
    mismatch.setItem(STORAGE_KEY, legacyRaw)
    mismatch.forceBackupReadbackMismatch = true
    const mismatchStore = await loadStore(mismatch)
    expect(mismatchStore.recoveryState.value).toBe('blocked')
    expect(mismatch.getItem(STORAGE_KEY)).toBe(legacyRaw)
  })

  it('keeps cancellation blocked and requires confirmation before discard can replace active data', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, malformedRaw)
    const store = await loadStore(storage)

    expect(store.discardBlockedData(false)).toBe(false)
    expect(store.recoveryState.value).toBe('blocked')
    expect(storage.getItem(STORAGE_KEY)).toBe(malformedRaw)
    expect(store.discardBlockedData(true)).toBe(true)
    expect(store.recoveryState.value).toBe('ready')
    expect(storage.getItem(BACKUP_KEY)).toBe(malformedRaw)
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ players: [], sessions: [], matches: [], overrides: [], baselines: [] }))
  })
})

describe('blocked CSV recovery', () => {
  it('keeps blocked storage and reactive data unchanged when a valid candidate cannot be persisted', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, malformedRaw)
    const store = await loadStore(storage)
    const beforeData = JSON.stringify(store.data)
    const candidate = {
      players: [{ id: 'p', name: 'Player', color: '#000000', rating: 1500, rd: 300, vol: 0.06, initialRating: 1500, createdAt: 1 }],
      sessions: [{ id: 's', name: 'Session', startedAt: 2, presentIds: ['p'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') }],
      matches: [], overrides: [], baselines: [],
    }

    storage.failKey = STORAGE_KEY
    expect(store.recoverFromCsvText(exportCsv(candidate))).toBe(false)
    expect(storage.getItem(STORAGE_KEY)).toBe(malformedRaw)
    expect(storage.getItem(BACKUP_KEY)).toBe(malformedRaw)
    expect(JSON.stringify(store.data)).toBe(beforeData)
    expect(store.recoveryState.value).toBe('blocked')
    expect(store.blockedRawData.value).toBe(malformedRaw)
  })

  it('keeps blocked bytes and in-memory data unchanged for invalid or over-budget CSV, but persists a fully valid candidate before ready', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, malformedRaw)
    const store = await loadStore(storage)
    const beforeRaw = storage.getItem(STORAGE_KEY)
    const beforeData = JSON.stringify(store.data)

    expect(store.recoverFromCsvText('not a csv')).toBe(false)
    expect(store.recoveryState.value).toBe('blocked')
    expect(store.blockedRawData.value).toBe(malformedRaw)
    expect(storage.getItem(STORAGE_KEY)).toBe(beforeRaw)
    expect(JSON.stringify(store.data)).toBe(beforeData)

    expect(store.recoverFromCsvText('x'.repeat(5 * 1024 * 1024 + 1))).toBe(false)
    expect(store.recoveryState.value).toBe('blocked')
    expect(storage.getItem(STORAGE_KEY)).toBe(beforeRaw)
    expect(JSON.stringify(store.data)).toBe(beforeData)

    const candidate = {
      players: [{ id: 'p', name: 'Player', color: '#000000', rating: 1500, rd: 300, vol: 0.06, initialRating: 1500, createdAt: 1 }],
      sessions: [{ id: 's', name: 'Session', startedAt: 2, presentIds: ['p'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') }],
      matches: [], overrides: [], baselines: [],
    }
    const validCsv = exportCsv(candidate)
    let dataAtActiveWrite: string | null = null
    storage.onSet = (key) => {
      if (key === STORAGE_KEY) dataAtActiveWrite = JSON.stringify(store.data)
    }
    expect(store.recoverFromCsvText(validCsv)).toBe(true)
    expect(dataAtActiveWrite).toBe(beforeData)
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(candidate))
    expect(store.data).toEqual(candidate)
    expect(store.recoveryState.value).toBe('ready')
    expect(store.blockedRawData.value).toBeNull()

    const beforeMalformedImport = JSON.stringify(store.data)
    expect(() => store.importCsvText(validCsv.replace('explicit-unknown', 'not-a-reason'))).toThrow()
    expect(JSON.stringify(store.data)).toBe(beforeMalformedImport)
  })
})

describe('scoring-format match lifecycle', () => {
  function setup(snapshot: ScoringFormatSnapshot = createCatalogSnapshot('badminton-21-w2-c30')) {
    const players = ['a', 'b', 'c', 'd'].map((name) => addPlayer(name, 1500))
    startSession(players.map((player) => player.id), snapshot)
    return players
  }

  it('requires an explicit new-session choice and leaves a legacy-missing active session blocked after cancel', () => {
    const players = ['a', 'b', 'c', 'd'].map((name) => addPlayer(name, 1500))
    expect(() => Reflect.apply(startSession, null, [players.map((player) => player.id)])).toThrow(/explicit/i)
    data.sessions.push({ id: 'legacy', name: 'legacy', startedAt: 0, presentIds: players.map((player) => player.id), leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('legacy-missing') })
    expect(proposeRound()).toBe(false)
    expect(ui.pending).toBeNull()
    expect(setSessionDefaultScoringFormat(null)).toBe(false)
    expect(proposeRound()).toBe(false)
    const legacyMissing = createUnknownSnapshot('legacy-missing')
    expect(() => startSession(players.map((player) => player.id), legacyMissing)).toThrow(/explicit|legacy/i)
    expect(setSessionDefaultScoringFormat(legacyMissing)).toBe(false)
    expect(proposeRound()).toBe(false)
    expect(setSessionDefaultScoringFormat(createUnknownSnapshot('explicit-unknown'))).toBe(true)
    expect(proposeRound()).toBe(true)
    const inherited = ui.pending!.scoringFormat
    expect(setPendingScoringFormat(legacyMissing)).toBe(false)
    expect(ui.pending!.scoringFormat).toBe(inherited)
  })

  it('keeps defaults prospective and snapshots detached across pending, live, and completed contexts', () => {
    setup()
    expect(proposeRound()).toBe(true)
    const inherited = ui.pending!.scoringFormat
    expect(Object.isFrozen(inherited)).toBe(true)
    expect(setSessionDefaultScoringFormat(createCatalogSnapshot('badminton-15-w2-c21'))).toBe(true)
    expect(ui.pending!.scoringFormat).toEqual(inherited)
    const override = createCustomSnapshot('Club 11', { target: 11, winBy: 2, cap: 15 })
    expect(setPendingScoringFormat(override)).toBe(true)
    expect(ui.pending!.scoringFormat).toEqual(override)
    expect(ui.pending!.scoringFormat).not.toBe(override)
    expect(resetPendingScoringFormat()).toBe(true)
    expect(ui.pending!.scoringFormat).toEqual(createCatalogSnapshot('badminton-15-w2-c21'))
    expect(startMatch()).toBe(true)
    const live = ui.live!.scoringFormat
    expect(setPendingScoringFormat(createUnknownSnapshot('explicit-unknown'))).toBe(false)
    expect(setSessionDefaultScoringFormat(createUnknownSnapshot('explicit-unknown'))).toBe(true)
    expect(ui.live!.scoringFormat).toEqual(live)
    expect(submitScore(15, 13)).toBeNull()
    expect(data.matches[0]!.scoringFormat).toEqual(live)
    expect(data.matches[0]!.scoringFormat).not.toBe(live)
  })

  it('rejects illegal known endpoints before history, ratings, and UI completion, but preserves unknown integer semantics', () => {
    setup()
    expect(proposeRound()).toBe(true)
    expect(startMatch()).toBe(true)
    const ratings = data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol }))
    const live = ui.live
    expect(submitScore(21, 20)).toMatch(/合法|legal|比分/)
    expect(data.matches).toHaveLength(0)
    expect(data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol }))).toEqual(ratings)
    expect(ui.live).toBe(live)
    expect(submitScore(21, 15)).toBeNull()

    resetStore()
    const players = setup(createUnknownSnapshot('explicit-unknown'))
    expect(proposeRound()).toBe(true)
    expect(startMatch()).toBe(true)
    expect(submitScore(Number.MAX_SAFE_INTEGER + 2, 1)).toBeNull()
    expect(data.matches[0]!.scoreA).toBe(Number.MAX_SAFE_INTEGER + 2)
    expect(players).toHaveLength(4)
  })

  it('validates score edits against the frozen snapshot without replacing it or mutating ratings on failure', () => {
    setup()
    expect(proposeRound()).toBe(true)
    expect(startMatch()).toBe(true)
    expect(submitScore(21, 15)).toBeNull()
    const match = data.matches[0]!
    const snapshot = match.scoringFormat
    const ratings = data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol }))
    expect(editMatchScore(match.id, 21, 20)).toMatch(/合法|legal|比分/)
    expect(match.scoringFormat).toBe(snapshot)
    expect(match.scoreA).toBe(21)
    expect(match.scoreB).toBe(15)
    expect(data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol }))).toEqual(ratings)
  })
})

/**
 * 本機資料讀不懂時的阻斷式復原。
 * store 在 module 載入時決定狀態，因此每個案例都以 resetModules 重新載入。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'badminton-matcher:v1'
const BACKUP = 'badminton-matcher:pre-scoring-format-v1'

class MemoryStorage {
  map = new Map<string, string>()
  get length() { return this.map.size }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
  clear() { this.map.clear() }
}

let mem: MemoryStorage

const legacy = JSON.stringify({
  players: [{ id: 'p1', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 1 }],
  sessions: [], matches: [], overrides: [], baselines: [],
})

beforeEach(() => {
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem as unknown as Storage)
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

const loadStore = () => import('./store')

describe('資料可正常讀取時', () => {
  it('狀態為 ready 且照常持久化', async () => {
    mem.map.set(KEY, legacy)
    const store = await loadStore()
    expect(store.recoveryState.value.status).toBe('ready')
    expect(store.data.players).toHaveLength(1)
    expect(store.persistData()).toBe(true)
    expect(mem.map.get(KEY)).toContain('"players"')
  })

  it('首次寫入前保留一份舊格式備份', async () => {
    mem.map.set(KEY, legacy)
    const store = await loadStore()
    store.persistData()
    expect(mem.map.get(BACKUP)).toBe(legacy)
  })

  it('備份具冪等性，不覆寫既有備份', async () => {
    mem.map.set(KEY, legacy)
    mem.map.set(BACKUP, '先前的備份')
    const store = await loadStore()
    store.persistData()
    expect(mem.map.get(BACKUP)).toBe('先前的備份')
  })

  it('全新安裝不建立備份', async () => {
    const store = await loadStore()
    store.persistData()
    expect(mem.map.has(BACKUP)).toBe(false)
  })

  it('首次載入 active legacy session 就安全寫回固定 migration boundary', async () => {
    const raw = JSON.stringify({
      players: [{ id: 'p1', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 1 }],
      sessions: [{ id: 's1', name: 'active', startedAt: 10, presentIds: ['p1'], leftIds: [], volunteerRest: [], active: true }],
      matches: [], overrides: [], baselines: [],
    })
    mem.map.set(KEY, raw)
    await loadStore()
    const firstWrite = mem.map.get(KEY)!
    const firstEvents = JSON.parse(firstWrite).sessions[0].attendanceEvents
    expect(firstEvents).toHaveLength(2)
    expect(mem.map.get(BACKUP)).toBe(raw)

    vi.resetModules()
    await loadStore()
    expect(JSON.parse(mem.map.get(KEY)!).sessions[0].attendanceEvents).toEqual(firstEvents)
  })

  it('degrades only invalid fairness history, retains raw persistence, and repairs from one suffix', async () => {
    const raw = JSON.stringify({
      players: [
        { id: 'p1', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 1 },
        { id: 'p2', name: 'B', color: '#111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 2 },
      ],
      sessions: [{
        id: 's1', name: 'active', startedAt: 10, presentIds: ['p1', 'p2'], leftIds: [], volunteerRest: [], active: true,
        attendanceEvents: [{ id: 'bad', sessionId: 's1', kind: 'leave', playerId: 'p1', at: 0, sequence: 0 }],
      }],
      matches: [], overrides: [], baselines: [],
    })
    mem.map.set(KEY, raw)
    const store = await loadStore()
    expect(store.recoveryState.value.status).toBe('ready')
    expect(store.fairnessProjection.value).toMatchObject({ status: 'degraded' })
    expect(JSON.parse(mem.map.get(KEY)!).sessions[0].attendanceEvents).toEqual(JSON.parse(raw).sessions[0].attendanceEvents)
    expect(store.exportCsvText()).toContain('bad')
    expect(store.repairFairness()).toBe(true)
    expect(store.fairnessProjection.value).toMatchObject({ status: 'valid' })
    const events = store.data.sessions[0]!.attendanceEvents!
    expect(events.filter((event) => event.kind === 'fairness-recovery-boundary')).toHaveLength(1)
    expect(events.slice(-2).map((event) => event.kind)).toEqual(['fairness-period-started', 'fairness-period-started'])
  })
})

describe('資料讀不懂時', () => {
  it('進入 blocked 並原樣保留，絕不覆寫', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    expect(store.recoveryState.value.status).toBe('blocked')
    expect(store.persistData()).toBe(false)
    expect(mem.map.get(KEY)).toBe('{壞掉的 JSON')
  })

  it('宣告的賽制快照損毀時 blocked，不降級為未知', async () => {
    mem.map.set(KEY, JSON.stringify({
      players: [], sessions: [], overrides: [], baselines: [],
      matches: [{
        id: 'm1', sessionId: 's1', at: 1, mode: 'doubles', teamA: ['a'], teamB: ['b'],
        scoreA: 15, scoreB: 12, resters: [], scoringFormat: { schemaVersion: 1, kind: 'catalog' },
      }],
    }))
    const store = await loadStore()
    expect(store.recoveryState.value.status).toBe('blocked')
  })

  it('捨棄後回到 ready 並保留原始值為備份', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    store.discardBlockedData()
    expect(store.recoveryState.value.status).toBe('ready')
    expect(store.data.players).toEqual([])
    expect(mem.map.get(BACKUP)).toBe('{壞掉的 JSON')
    expect(mem.map.get(KEY)).toContain('"players"')
  })

  it('匯入有效 CSV 後回到 ready', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    const csv = [
      '[players]',
      'id,name,color,rating,rd,vol,initialRating,createdAt,archivedAt',
      'p9,還原,#111111,1500,350,0.06,1500,1000,',
      '[matches]',
      'id,sessionId,at,mode,teamA,teamB,scoreA,scoreB,resters',
      'm1,s1,2500,doubles,p9,p9,15,12,',
    ].join('\n')
    store.importCsvText(csv)
    expect(store.recoveryState.value.status).toBe('ready')
    expect(store.data.players[0]!.name).toBe('還原')
  })

  it('匯入失敗時維持 blocked 且原始值不變', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    expect(() => store.importCsvText('完全不是 CSV')).toThrow()
    expect(store.recoveryState.value.status).toBe('blocked')
    expect(mem.map.get(KEY)).toBe('{壞掉的 JSON')
  })
})

describe('blocked 期間變更指令不可用', () => {
  /** 逐一呼叫每個變更指令，確認資料與 localStorage 都沒被動到 */
  it('所有變更指令都是 no-op，且不寫入 localStorage', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    const { createUnknownSnapshot } = await import('./lib/scoring-format')
    const fmt = createUnknownSnapshot('explicit-unknown')
    expect(store.recoveryState.value.status).toBe('blocked')

    const snapshot = JSON.stringify(store.data)

    // 回傳 boolean 者應為 false
    expect(store.overrideRating('p1', 1600)).toBe(false)
    expect(store.archivePlayer('p1')).toBe(false)
    expect(store.restorePlayer('p1')).toBe(false)
    expect(store.proposeRound()).toBe(false)

    // 回傳錯誤訊息者應說明原因
    expect(store.submitScore(15, 9)).toBe(store.BLOCKED_MESSAGE)
    expect(store.editMatchScore('m1', 15, 9)).toBe(store.BLOCKED_MESSAGE)

    // addPlayer 無法以回傳值表達失敗，明確 throw
    expect(() => store.addPlayer('偷偷新增', 1500)).toThrow(store.BLOCKED_MESSAGE)

    // 其餘為 void，直接確認沒有副作用
    store.renamePlayer('p1', '改名')
    store.setPlayerColor('p1', '#fff')
    store.startSession([], fmt)
    store.setSessionDefaultScoringFormat(fmt)
    store.setPendingScoringFormat(fmt)
    store.endSession()
    store.joinSession('p1')
    store.leaveSession('p1')
    store.toggleVolunteerRest('p1')
    store.swapInPending('p1', 'p2')
    store.startMatch()
    store.cancelPending()
    store.deleteMatch('m1')
    store.clearSession('s1', false)
    store.clearAllHistory(false)

    expect(JSON.stringify(store.data)).toBe(snapshot)
    expect(store.data.players).toEqual([])
    expect(store.data.sessions).toEqual([])
    expect(mem.map.get(KEY)).toBe('{壞掉的 JSON')
  })

  it('復原流程本身不受 guard 影響', async () => {
    mem.map.set(KEY, '{壞掉的 JSON')
    const store = await loadStore()
    store.discardBlockedData()
    expect(store.recoveryState.value.status).toBe('ready')
    // 解除封鎖後變更指令恢復可用
    expect(() => store.addPlayer('正常新增', 1500)).not.toThrow()
    expect(store.data.players).toHaveLength(1)
  })

  it('ready 狀態下 guard 不會誤擋', async () => {
    const store = await loadStore()
    expect(store.recoveryState.value.status).toBe('ready')
    const p = store.addPlayer('甲', 1500)
    expect(store.data.players).toHaveLength(1)
    expect(store.overrideRating(p.id, 1600)).toBe(true)
  })
})

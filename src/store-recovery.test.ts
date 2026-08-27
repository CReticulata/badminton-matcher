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

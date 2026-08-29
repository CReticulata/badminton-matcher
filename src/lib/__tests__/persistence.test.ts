import { describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  ensurePreFormatBackup,
  loadPersisted,
} from '../persistence'
import { createCatalogSnapshot } from '../scoring-format'

class FakeStorage {
  map = new Map<string, string>()
  failOn: string | null = null
  reads = 0
  getItem(key: string) {
    this.reads++
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string) {
    if (this.failOn === key) throw new Error('quota')
    this.map.set(key, value)
  }
  removeItem(key: string) { this.map.delete(key) }
}
const storage = () => new FakeStorage() as unknown as Storage & FakeStorage

const legacyRaw = JSON.stringify({
  players: [{ id: 'p1', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 1 }],
  sessions: [{ id: 's1', name: 'x', startedAt: 10, presentIds: ['p1'], leftIds: [], volunteerRest: [], active: false }],
  matches: [{ id: 'm1', sessionId: 's1', at: 20, mode: 'doubles', teamA: ['p1'], teamB: ['p1'], scoreA: 15, scoreB: 12, resters: [] }],
  overrides: [], baselines: [],
})

describe('loadPersisted', () => {
  it('沒有既存資料時回傳空的 ready', () => {
    const out = loadPersisted(storage())
    expect(out.status).toBe('ready')
    expect(out.status === 'ready' && out.data.players).toEqual([])
  })

  it('舊資料載入成功並補成 legacy-missing', () => {
    const s = storage()
    s.map.set(STORAGE_KEY, legacyRaw)
    const out = loadPersisted(s)
    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    expect(out.data.matches[0]!.scoringFormat).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing' })
  })

  it('JSON 壞掉時進入 blocked 並保留原始值', () => {
    const s = storage()
    s.map.set(STORAGE_KEY, '{not json')
    const out = loadPersisted(s)
    expect(out.status).toBe('blocked')
    expect(out.status === 'blocked' && out.raw).toBe('{not json')
    expect(s.map.get(STORAGE_KEY)).toBe('{not json')
  })

  it('宣告的賽制快照壞掉時 blocked，不降級為未知', () => {
    const s = storage()
    s.map.set(STORAGE_KEY, JSON.stringify({
      ...JSON.parse(legacyRaw),
      matches: [{ ...JSON.parse(legacyRaw).matches[0], scoringFormat: { kind: 'catalog' } }],
    }))
    expect(loadPersisted(s).status).toBe('blocked')
  })

  it('結構化快照與比分矛盾時 blocked', () => {
    const s = storage()
    s.map.set(STORAGE_KEY, JSON.stringify({
      ...JSON.parse(legacyRaw),
      matches: [{
        ...JSON.parse(legacyRaw).matches[0], scoreA: 15, scoreB: 14,
        scoringFormat: JSON.parse(JSON.stringify(createCatalogSnapshot('badminton-15-w2-c21'))),
      }],
    }))
    expect(loadPersisted(s).status).toBe('blocked')
  })

  it('保留可恢復的 live match，並拒絕損毀的 live identity', () => {
    const base = JSON.parse(legacyRaw)
    base.players.push({ id: 'p2', name: 'B', color: '#111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 2 })
    base.sessions[0].active = true
    base.sessions[0].presentIds = ['p1', 'p2']
    base.sessions[0].liveMatch = {
      mode: 'singles', teamA: ['p1'], teamB: ['p2'], resters: [],
      scoringFormat: { schemaVersion: 1, kind: 'unknown', reason: 'explicit-unknown' },
      liveMatchId: 'live-1', startedAt: 30,
    }
    const valid = storage()
    valid.map.set(STORAGE_KEY, JSON.stringify(base))
    const out = loadPersisted(valid)
    expect(out.status === 'ready' && out.data.sessions[0]!.liveMatch?.liveMatchId).toBe('live-1')

    base.sessions[0].liveMatch.liveMatchId = ''
    const broken = storage()
    broken.map.set(STORAGE_KEY, JSON.stringify(base))
    expect(loadPersisted(broken).status).toBe('blocked')
  })

  it('blocked 時絕不寫入 storage', () => {
    const s = storage()
    s.map.set(STORAGE_KEY, '{not json')
    const before = new Map(s.map)
    loadPersisted(s)
    expect([...s.map]).toEqual([...before])
  })
})

describe('ensurePreFormatBackup', () => {
  it('第一次寫入前備份原始值', () => {
    const s = storage()
    expect(ensurePreFormatBackup(s, legacyRaw)).toBe(true)
    expect(s.map.get(BACKUP_KEY)).toBe(legacyRaw)
  })

  it('已存在的備份不覆寫', () => {
    const s = storage()
    s.map.set(BACKUP_KEY, 'original')
    expect(ensurePreFormatBackup(s, legacyRaw)).toBe(true)
    expect(s.map.get(BACKUP_KEY)).toBe('original')
  })

  it('備份寫入失敗時回傳 false（不得寫入加料後的資料）', () => {
    const s = storage()
    s.failOn = BACKUP_KEY
    expect(ensurePreFormatBackup(s, legacyRaw)).toBe(false)
    expect(s.map.has(BACKUP_KEY)).toBe(false)
  })

  it('回讀不一致時回傳 false', () => {
    const s = storage()
    const original = s.setItem.bind(s)
    s.setItem = (key: string, value: string) => { original(key, key === BACKUP_KEY ? value.slice(1) : value) }
    expect(ensurePreFormatBackup(s, legacyRaw)).toBe(false)
  })

  it('全新安裝（沒有原始值）不需要備份', () => {
    const s = storage()
    expect(ensurePreFormatBackup(s, null)).toBe(true)
    expect(s.map.has(BACKUP_KEY)).toBe(false)
  })
})

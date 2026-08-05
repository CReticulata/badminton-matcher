import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv } from '../csv'
import type { AppData } from '../../types'

const sample: AppData = {
  players: [
    {
      id: 'p1',
      name: '小明, "特別"',
      color: '#ef4444',
      rating: 1512.345,
      rd: 290.1,
      vol: 0.06,
      initialRating: 1500,
      createdAt: 1000,
    },
    {
      id: 'p2',
      name: '阿華',
      color: '#3b82f6',
      rating: 1488,
      rd: 300,
      vol: 0.06,
      initialRating: 1300,
      createdAt: 1001,
    },
  ],
  sessions: [
    {
      id: 's1',
      name: '2026/8/5 場次',
      startedAt: 2000,
      presentIds: ['p1', 'p2'],
      leftIds: [],
      volunteerRest: ['p2'],
      active: true,
    },
  ],
  matches: [
    {
      id: 'm1',
      sessionId: 's1',
      at: 3000,
      mode: 'doubles',
      teamA: ['p1', 'p2'],
      teamB: ['p1', 'p2'],
      scoreA: 21,
      scoreB: 15,
      resters: ['p1'],
    },
  ],
  overrides: [{ id: 'o1', playerId: 'p1', rating: 1800, at: 2500 }],
}

describe('CSV 匯出/匯入', () => {
  it('round-trip 後資料一致（含逗號與引號跳脫）', () => {
    const csv = exportCsv(sample)
    const back = importCsv(csv)
    expect(back).toEqual(sample)
  })

  it('名字含換行時 round-trip 後資料一致', () => {
    const data: AppData = {
      ...sample,
      players: [{ ...sample.players[0]!, name: 'Smith, "The Ace"\n第二行' }, sample.players[1]!],
    }
    const back = importCsv(exportCsv(data))
    expect(back).toEqual(data)
  })

  it('空內容或格式錯誤會 throw', () => {
    expect(() => importCsv('')).toThrow()
    expect(() => importCsv('id,name\n1,x')).toThrow()
  })
})

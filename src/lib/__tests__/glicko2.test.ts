import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RD,
  DEFAULT_VOL,
  applyMatch,
  recalcAll,
  updateRating,
  type GlickoState,
} from '../glicko2'
import type { Match } from '../../types'

describe('updateRating（Glickman 論文範例）', () => {
  it('rating 1500 / RD 200 對三個對手後 ≈ 1464.06 / 151.52', () => {
    const player: GlickoState = { rating: 1500, rd: 200, vol: 0.06 }
    const results = [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]
    const out = updateRating(player, results, 0.5)
    expect(out.rating).toBeCloseTo(1464.06, 1)
    expect(out.rd).toBeCloseTo(151.52, 1)
    expect(out.vol).toBeCloseTo(0.05999, 4)
  })

  it('沒有比賽時只擴大 RD、rating 不變', () => {
    const out = updateRating({ rating: 1600, rd: 100, vol: 0.06 }, [])
    expect(out.rating).toBe(1600)
    expect(out.rd).toBeGreaterThan(100)
    expect(out.vol).toBe(0.06)
  })

  it('勝者 rating 上升、敗者下降', () => {
    const a: GlickoState = { rating: 1500, rd: 200, vol: 0.06 }
    const b: GlickoState = { rating: 1500, rd: 200, vol: 0.06 }
    const a2 = updateRating(a, [{ rating: b.rating, rd: b.rd, score: 1 }])
    const b2 = updateRating(b, [{ rating: a.rating, rd: a.rd, score: 0 }])
    expect(a2.rating).toBeGreaterThan(1500)
    expect(b2.rating).toBeLessThan(1500)
  })
})

describe('applyMatch（雙打虛擬對手）', () => {
  const mkStates = (): Map<string, GlickoState> =>
    new Map([
      ['a', { rating: 1400, rd: 100, vol: 0.06 }],
      ['b', { rating: 1600, rd: 100, vol: 0.06 }],
      ['c', { rating: 1500, rd: 100, vol: 0.06 }],
      ['d', { rating: 1500, rd: 100, vol: 0.06 }],
    ])

  it('每人以對方兩人平均 rating 為虛擬對手更新', () => {
    const states = mkStates()
    const updated = applyMatch(states, {
      teamA: ['a', 'b'],
      teamB: ['c', 'd'],
      scoreA: 21,
      scoreB: 15,
    })
    // 手算對照：a 對 (1500,100) 勝
    const expected = updateRating(
      { rating: 1400, rd: 100, vol: 0.06 },
      [{ rating: 1500, rd: 100, score: 1 }],
    )
    expect(updated.get('a')!.rating).toBeCloseTo(expected.rating, 6)
    // 勝方上升、敗方下降
    expect(updated.get('a')!.rating).toBeGreaterThan(1400)
    expect(updated.get('b')!.rating).toBeGreaterThan(1600)
    expect(updated.get('c')!.rating).toBeLessThan(1500)
    expect(updated.get('d')!.rating).toBeLessThan(1500)
    // 未上場者不在更新結果中
    expect(updated.size).toBe(4)
  })

  it('平手 throw', () => {
    expect(() =>
      applyMatch(mkStates(), { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 10 }),
    ).toThrow()
  })

  it('單打為標準一對一更新', () => {
    const states = mkStates()
    const updated = applyMatch(states, { teamA: ['a'], teamB: ['c'], scoreA: 21, scoreB: 19 })
    const expected = updateRating(
      { rating: 1400, rd: 100, vol: 0.06 },
      [{ rating: 1500, rd: 100, score: 1 }],
    )
    expect(updated.get('a')!.rating).toBeCloseTo(expected.rating, 6)
    expect(updated.size).toBe(2)
  })
})

describe('recalcAll（全量重算）', () => {
  const players = [
    { id: 'a', initialRating: 1500 },
    { id: 'b', initialRating: 1500 },
    { id: 'c', initialRating: 1300 },
    { id: 'd', initialRating: 1700 },
  ]
  const mkMatch = (n: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match => ({
    id: `m${n}`,
    sessionId: 's1',
    at: n,
    mode: 'doubles',
    teamA,
    teamB,
    scoreA,
    scoreB,
    resters: [],
  })

  it('重算結果與逐場即時更新一致', () => {
    const matches = [
      mkMatch(1, ['a', 'b'], ['c', 'd'], 21, 18),
      mkMatch(2, ['a', 'c'], ['b', 'd'], 15, 21),
      mkMatch(3, ['a', 'd'], ['b', 'c'], 21, 10),
    ]
    // 逐場模擬
    let states = new Map<string, GlickoState>(
      players.map((p) => [p.id, { rating: p.initialRating, rd: DEFAULT_RD, vol: DEFAULT_VOL }]),
    )
    for (const m of matches) {
      const upd = applyMatch(states, m)
      states = new Map([...states, ...upd])
    }
    const recalced = recalcAll(players, matches)
    for (const p of players) {
      expect(recalced.get(p.id)!.rating).toBeCloseTo(states.get(p.id)!.rating, 9)
      expect(recalced.get(p.id)!.rd).toBeCloseTo(states.get(p.id)!.rd, 9)
    }
  })

  it('刪除一場後重算，結果等於只打剩下場次', () => {
    const m1 = mkMatch(1, ['a', 'b'], ['c', 'd'], 21, 18)
    const m2 = mkMatch(2, ['a', 'c'], ['b', 'd'], 15, 21)
    const after = recalcAll(players, [m2])
    const also = recalcAll(players, [m1, m2].filter((m) => m.id !== 'm1'))
    expect(also.get('a')!.rating).toBeCloseTo(after.get('a')!.rating, 9)
  })

  it('手動覆寫事件依時間序重播（覆寫後 RD 重設為高值）', () => {
    const m1 = mkMatch(1, ['a', 'b'], ['c', 'd'], 21, 18)
    const out = recalcAll(players, [m1], [{ id: 'o1', playerId: 'a', rating: 2000, at: 5 }])
    expect(out.get('a')!.rating).toBe(2000)
    expect(out.get('a')!.rd).toBe(350)
  })
})

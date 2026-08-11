import { describe, expect, it } from 'vitest'
import type { Match } from '../../types'
import {
  balanceTeams,
  consecutivePlayCounts,
  generateRound,
  type Candidate,
} from '../matchmaking'

const mk = (
  id: string,
  playCount: number,
  rating = 1500,
  volunteerRest = false,
  consecutivePlayCount = 0,
): Candidate => ({
  id,
  playCount,
  rating,
  volunteerRest,
  consecutivePlayCount,
})

/** 決定性的假亂數 */
const seededRng = (seed = 42) => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const completedMatch = (
  id: string,
  sessionId: string,
  at: number,
  playing: [string, string, string, string],
): Match => ({
  id,
  sessionId,
  at,
  mode: 'doubles',
  teamA: playing.slice(0, 2),
  teamB: playing.slice(2),
  scoreA: 21,
  scoreB: 15,
  resters: [],
})

describe('consecutivePlayCounts', () => {
  it('從同一場次最新一場向前計算未中斷的實際上場場數', () => {
    const counts = consecutivePlayCounts(
      [
        completedMatch('m2', 'session-a', 2, ['a', 'b', 'c', 'e']),
        completedMatch('m3', 'session-a', 3, ['a', 'b', 'd', 'e']),
        completedMatch('m1', 'session-a', 1, ['a', 'b', 'c', 'd']),
      ],
    )

    expect(counts.get('a')).toBe(3)
    expect(counts.get('b')).toBe(3)
    expect(counts.get('d')).toBe(1)
    expect(counts.get('e')).toBe(2)
    expect(counts.get('c') ?? 0).toBe(0)
  })

  it('單打與雙打共用連續紀錄', () => {
    const singles: Match = {
      id: 'm2',
      sessionId: 'session-a',
      at: 2,
      mode: 'singles',
      teamA: ['a'],
      teamB: ['b'],
      scoreA: 21,
      scoreB: 18,
      resters: ['c', 'd'],
    }
    const counts = consecutivePlayCounts(
      [
        completedMatch('m1', 'session-a', 1, ['a', 'b', 'c', 'd']),
        singles,
      ],
    )

    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(2)
    expect(counts.get('c') ?? 0).toBe(0)
    expect(consecutivePlayCounts([])).toEqual(new Map())
  })

  it('時間相同時以較後記錄者視為較新一場', () => {
    const counts = consecutivePlayCounts([
      completedMatch('m1', 'session-a', 1, ['a', 'b', 'c', 'd']),
      completedMatch('m2', 'session-a', 1, ['a', 'b', 'd', 'e']),
    ])

    expect(counts.get('a')).toBe(2)
    expect(counts.get('e')).toBe(1)
    expect(counts.get('c') ?? 0).toBe(0)
  })
})

describe('generateRound', () => {
  it('4 人：全員上場、無人休息', () => {
    const out = generateRound([mk('a', 0), mk('b', 0), mk('c', 0), mk('d', 0)], 'doubles')!
    expect(out.teamA.length).toBe(2)
    expect(out.teamB.length).toBe(2)
    expect(out.resters).toEqual([])
    expect(new Set([...out.teamA, ...out.teamB]).size).toBe(4)
  })

  it('5 人：1 人休息，且輪流休息直到大家都休息過（模擬多回合）', () => {
    const rng = seededRng()
    const counts = new Map<string, number>([...'abcde'].map((id) => [id, 0]))
    const restCounts = new Map<string, number>([...'abcde'].map((id) => [id, 0]))
    for (let round = 0; round < 10; round++) {
      const cands = [...counts].map(([id, c]) => mk(id, c))
      const out = generateRound(cands, 'doubles', rng)!
      expect(out.resters.length).toBe(1)
      for (const id of [...out.teamA, ...out.teamB]) counts.set(id, counts.get(id)! + 1)
      for (const id of out.resters) restCounts.set(id, restCounts.get(id)! + 1)
      // 公平不變量：任兩人上場次數差 ≤ 1
      const values = [...counts.values()]
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      // 沒人休息 2 次前不可能有人休息 0 次以外的失衡
      const rests = [...restCounts.values()]
      expect(Math.max(...rests) - Math.min(...rests)).toBeLessThanOrEqual(1)
    }
    // 5 人打 10 回合：每人恰好休息 2 次、上場 8 次
    for (const id of 'abcde') {
      expect(restCounts.get(id)).toBe(2)
      expect(counts.get(id)).toBe(8)
    }
  })

  it('8 人：4 上場 4 休息，兩回合後大家都打過（輪替）', () => {
    const rng = seededRng(7)
    const ids = [...'abcdefgh']
    const counts = new Map<string, number>(ids.map((id) => [id, 0]))
    for (let round = 0; round < 2; round++) {
      const out = generateRound(
        [...counts].map(([id, c]) => mk(id, c)),
        'doubles',
        rng,
      )!
      expect(out.resters.length).toBe(4)
      for (const id of [...out.teamA, ...out.teamB]) counts.set(id, counts.get(id)! + 1)
    }
    // 8 人兩回合共 8 個上場名額 → 每人恰好上場一次
    for (const id of ids) expect(counts.get(id)).toBe(1)
  })

  it('遲到加入：上場次數少者連打直到追平（不會被安排休息）', () => {
    const rng = seededRng(3)
    // 4 人已各打 3 場，late 剛加入 0 場 → 5 人局
    const counts = new Map<string, number>([
      ['a', 3],
      ['b', 3],
      ['c', 3],
      ['d', 3],
      ['late', 0],
    ])
    for (let round = 0; round < 3; round++) {
      const out = generateRound(
        [...counts].map(([id, c]) => mk(id, c)),
        'doubles',
        rng,
      )!
      // late 未追平前不可能休息
      expect(out.resters).not.toContain('late')
      for (const id of [...out.teamA, ...out.teamB]) counts.set(id, counts.get(id)! + 1)
    }
    expect(counts.get('late')).toBe(3)
  })

  it('自願休息：跳過安排、列入休息名單', () => {
    const out = generateRound(
      [mk('a', 0), mk('b', 0), mk('c', 0), mk('d', 5), mk('e', 0, 1500, true)],
      'doubles',
    )!
    expect(out.resters).toEqual(['e'])
    expect([...out.teamA, ...out.teamB].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('自願休息導致可上場人數不足時回傳 null', () => {
    const out = generateRound(
      [mk('a', 0), mk('b', 0), mk('c', 0), mk('d', 0, 1500, true)],
      'doubles',
    )
    expect(out).toBeNull()
  })

  it('人數不足回傳 null（雙打需 4 人、單打需 2 人）', () => {
    expect(generateRound([mk('a', 0), mk('b', 0), mk('c', 0)], 'doubles')).toBeNull()
    expect(generateRound([mk('a', 0)], 'singles')).toBeNull()
  })

  it('單打：兩隊各 1 人，其餘休息', () => {
    const out = generateRound([mk('a', 0), mk('b', 0), mk('c', 1)], 'singles')!
    expect(out.teamA.length).toBe(1)
    expect(out.teamB.length).toBe(1)
    expect(out.resters).toEqual(['c'])
  })

  it('並列時隨機：多次執行會出現不同休息者', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const out = generateRound(
        [mk('a', 0), mk('b', 0), mk('c', 0), mk('d', 0), mk('e', 0)],
        'doubles',
      )!
      seen.add(out.resters[0]!)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('上場次數相同時，連續上場場數最多者優先休息', () => {
    const out = generateRound(
      [
        mk('a', 4, 1500, false, 4),
        mk('b', 4, 1500, false, 3),
        mk('c', 4, 1500, false, 2),
        mk('d', 4, 1500, false, 1),
        mk('e', 4, 1500, false, 0),
      ],
      'doubles',
      () => 0.999999,
    )!

    expect(out.resters).toEqual(['a'])
  })

  it('當日上場次數優先於連續上場場數', () => {
    const out = generateRound(
      [
        mk('late', 0, 1500, false, 9),
        mk('a', 1, 1500, false, 0),
        mk('b', 1, 1500, false, 0),
        mk('c', 1, 1500, false, 0),
        mk('d', 2, 1500, false, 0),
      ],
      'doubles',
      () => 0.999999,
    )!

    expect([...out.teamA, ...out.teamB]).toContain('late')
    expect(out.resters).toEqual(['d'])
  })

  it('公平優先於平衡：上場次數最多者必休息，即使休息他會更平衡', () => {
    // e 的 rating 完美平衡場面，但 e 上場次數最多 → 仍必須休息
    const out = generateRound(
      [mk('a', 0, 1000), mk('b', 0, 1000), mk('c', 0, 2000), mk('d', 0, 2000), mk('e', 2, 1500)],
      'doubles',
    )!
    expect(out.resters).toEqual(['e'])
  })
})

describe('balanceTeams（強度平衡）', () => {
  it('選兩隊 rating 總和最接近的分法', () => {
    const out = balanceTeams(
      [mk('a', 0, 1000), mk('b', 0, 1200), mk('c', 0, 1400), mk('d', 0, 1600)],
      'doubles',
    )
    const teamOf = (id: string) => (out.teamA.includes(id) ? 'A' : 'B')
    // 最平衡：{1000,1600} vs {1200,1400}（差 0）
    expect(teamOf('a')).toBe(teamOf('d'))
    expect(teamOf('b')).toBe(teamOf('c'))
    expect(teamOf('a')).not.toBe(teamOf('b'))
  })
})

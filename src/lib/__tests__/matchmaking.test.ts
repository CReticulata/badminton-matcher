import { describe, expect, it } from 'vitest'
import { balanceTeams, generateRound, type Candidate } from '../matchmaking'

const mk = (id: string, playCount: number, rating = 1500, volunteerRest = false): Candidate => ({
  id,
  playCount,
  rating,
  volunteerRest,
})

/** 決定性的假亂數 */
const seededRng = (seed = 42) => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

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

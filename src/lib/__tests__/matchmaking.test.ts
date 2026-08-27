import { describe, expect, it } from 'vitest'
import type { Match } from '../../types'
import {
  BALANCE_TOLERANCE,
  balanceTeams,
  consecutivePlayCounts,
  generateRound,
  type Candidate,
} from '../matchmaking'
import { createUnknownSnapshot } from '../scoring-format'

/** 既有測試不驗證賽制，統一使用明確未知（維持原本的寬鬆比分規則） */
const TEST_FORMAT = createUnknownSnapshot('explicit-unknown')

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
  resters: [], scoringFormat: TEST_FORMAT,
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
      resters: ['c', 'd'], scoringFormat: TEST_FORMAT,
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

// ---------- 公平並列群內的聯合最佳化 ----------

/** 實際名單的 rating，用於量化平衡改善 */
const ROSTER: [string, number][] = [
  ['念學', 1741], ['若微', 1405], ['哲', 1395], ['小綱', 1304], ['汭禹', 1273],
  ['橘子', 1257], ['中仁', 1203], ['Chris', 1170], ['阿葉', 1142], ['Danny', 1076],
]
const rosterCandidates = (playCount = 0) =>
  ROSTER.map(([id, rating]) => mk(id, playCount, rating))

const teamGap = (out: { teamA: string[]; teamB: string[] }) => {
  const r = Object.fromEntries(ROSTER)
  const sum = (ids: string[]) => ids.reduce((t, id) => t + (r[id] ?? 0), 0)
  return Math.abs(sum(out.teamA) - sum(out.teamB))
}

describe('聯合最佳化：選人與分隊一起決定', () => {
  it('全員並列時，選出的組合達到所有同等公平選法中的最小差距（含容差）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const out = generateRound(rosterCandidates(), 'doubles', seededRng(seed))!
      // 最佳為 2；容差 25 內皆視為等價
      expect(teamGap(out)).toBeLessThanOrEqual(2 + BALANCE_TOLERANCE)
    }
  })

  it('明顯優於隨機選人（既有行為的期望差距約 154）', () => {
    const gaps: number[] = []
    for (let seed = 1; seed <= 60; seed++) {
      gaps.push(teamGap(generateRound(rosterCandidates(), 'doubles', seededRng(seed))!))
    }
    const mean = gaps.reduce((t, g) => t + g, 0) / gaps.length
    expect(mean).toBeLessThan(40)
  })

  it('公平嚴格較優者一定上場，只有剩餘名額從並列群挑', () => {
    // late 上場 0 次，其餘 5 人各 1 次 → late 必上，另外 3 名從並列的 5 人中挑
    const out = generateRound(
      [
        mk('late', 0, 1500),
        mk('a', 1, 1000), mk('b', 1, 1100), mk('c', 1, 1900),
        mk('d', 1, 2000), mk('e', 1, 1500),
      ],
      'doubles',
      seededRng(5),
    )!
    expect([...out.teamA, ...out.teamB]).toContain('late')
    expect(out.resters).toHaveLength(2)
  })

  it('不會為了平衡而讓上場次數較少者休息', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // e 上場最少但 rating 極端；仍必須上場
      const out = generateRound(
        [
          mk('a', 3, 1500), mk('b', 3, 1500), mk('c', 3, 1500),
          mk('d', 3, 1500), mk('e', 0, 3000),
        ],
        'doubles',
        seededRng(seed),
      )!
      expect([...out.teamA, ...out.teamB]).toContain('e')
    }
  })

  it('連續上場較少者優先，即使讓他上場比較不平衡', () => {
    const out = generateRound(
      [
        mk('a', 4, 1500, false, 0),
        mk('b', 4, 1500, false, 1),
        mk('c', 4, 1500, false, 1),
        mk('d', 4, 1500, false, 1),
        mk('e', 4, 3000, false, 0),
      ],
      'doubles',
      seededRng(9),
    )!
    // a 與 e 連續上場皆為 0，嚴格優於其餘三人 → 兩人都必上場
    expect([...out.teamA, ...out.teamB]).toEqual(expect.arrayContaining(['a', 'e']))
  })

  it('並列群剛好填滿時，只最佳化分隊（行為與既有相同）', () => {
    const out = generateRound(
      [mk('a', 0, 1000), mk('b', 0, 1200), mk('c', 0, 1400), mk('d', 0, 1600)],
      'doubles',
      seededRng(1),
    )!
    expect(out.resters).toEqual([])
    expect(teamGap({ teamA: out.teamA, teamB: out.teamB })).toBe(0)
  })
})

describe('容差與變化', () => {
  it('全員並列時，重複產生會涵蓋多種人選組合', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const out = generateRound(rosterCandidates(), 'doubles', seededRng(seed))!
      seen.add([...out.teamA, ...out.teamB].sort().join(','))
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  it('相同亂數來源產生完全相同的提案', () => {
    const a = generateRound(rosterCandidates(), 'doubles', seededRng(123))!
    const b = generateRound(rosterCandidates(), 'doubles', seededRng(123))!
    expect(a).toEqual(b)
  })

  it('與其他人差距極大者可能被冷落，但下一輪必定上場（上場次數差維持 1 以內）', () => {
    const counts = new Map(ROSTER.map(([id]) => [id, 0]))
    const rng = seededRng(11)
    for (let round = 0; round < 20; round++) {
      const cands = ROSTER.map(([id, rating]) => mk(id, counts.get(id)!, rating))
      const out = generateRound(cands, 'doubles', rng)!
      for (const id of [...out.teamA, ...out.teamB]) counts.set(id, counts.get(id)! + 1)
      const values = [...counts.values()]
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
    }
    // 全場最強者最終上場次數與其他人相差不超過 1
    expect(counts.get('念學')!).toBeGreaterThan(0)
  })
})

describe('列舉上限與退回', () => {
  it('並列群過大時仍產生提案，並標示未執行聯合搜尋', () => {
    const many = Array.from({ length: 40 }, (_, i) => mk(`p${i}`, 0, 1000 + i * 7))
    const diag = { wideSearchSkipped: false, enumeratedGroups: -1 }
    const out = generateRound(many, 'doubles', seededRng(2), diag)!
    expect(out.teamA).toHaveLength(2)
    expect(out.resters).toHaveLength(36)
    expect(diag.wideSearchSkipped).toBe(true)
  })

  it('在上限內時執行完整聯合搜尋並回報列舉數', () => {
    const diag = { wideSearchSkipped: true, enumeratedGroups: -1 }
    generateRound(rosterCandidates(), 'doubles', seededRng(2), diag)
    expect(diag.wideSearchSkipped).toBe(false)
    expect(diag.enumeratedGroups).toBe(210)
  })

  it('單打同樣以聯合搜尋挑出最接近的兩人', () => {
    const out = generateRound(
      [mk('a', 0, 1000), mk('b', 0, 1990), mk('c', 0, 2000), mk('d', 0, 1500)],
      'singles',
      seededRng(4),
    )!
    expect([...out.teamA, ...out.teamB].sort()).toEqual(['b', 'c'])
  })
})

describe('整場對照（回歸契約）', () => {
  /** 變更前的選人方式：公平排序後直接取前 need 人 */
  const previousBehaviour = (cands: readonly Candidate[], rng: () => number) => {
    const ordered = [...cands].sort(
      (a, b) => a.playCount - b.playCount || a.consecutivePlayCount - b.consecutivePlayCount,
    )
    void rng
    return balanceTeams(ordered.slice(0, 4), 'doubles')
  }

  const runSession = (
    pick: (c: readonly Candidate[], rng: () => number) => { teamA: string[]; teamB: string[] },
    seed: number,
    rounds: number,
  ) => {
    const counts = new Map(ROSTER.map(([id]) => [id, 0]))
    const rng = seededRng(seed)
    const gaps: number[] = []
    for (let round = 0; round < rounds; round++) {
      const cands = ROSTER.map(([id, rating]) => mk(id, counts.get(id)!, rating))
      const teams = pick(cands, rng)
      gaps.push(teamGap(teams))
      for (const id of [...teams.teamA, ...teams.teamB]) counts.set(id, counts.get(id)! + 1)
    }
    return { gaps, counts }
  }

  const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length

  it('穩態下平均隊伍差顯著優於變更前', () => {
    const before: number[] = []
    const after: number[] = []
    for (let seed = 1; seed <= 50; seed++) {
      before.push(...runSession(previousBehaviour, seed, 20).gaps)
      after.push(...runSession((c, rng) => generateRound(c, 'doubles', rng)!, seed, 20).gaps)
    }
    // 實測改善約 46%（第一輪全員並列時可達 91%，穩態因並列群縮小而降低）
    expect(mean(after)).toBeLessThan(mean(before) * 0.7)
  })

  it('公平不變式在整場中維持：任兩人上場次數差 ≤ 1', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { counts } = runSession((c, rng) => generateRound(c, 'doubles', rng)!, seed, 20)
      const values = [...counts.values()]
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
    }
  })

  it('與全場差距極大者仍能取得同等上場次數', () => {
    const { counts } = runSession((c, rng) => generateRound(c, 'doubles', rng)!, 1, 20)
    const values = [...counts.values()]
    // 念學高出次高者 336 分，任何含他的組合都不平衡，但上場次數不受影響
    expect(counts.get('念學')).toBe(Math.max(...values))
  })
})

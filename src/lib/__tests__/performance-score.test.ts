/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import matchmakingSource from '../matchmaking.ts?raw'
import {
  DEFAULT_RD,
  DEFAULT_VOL,
  applyMatch,
  performanceScore,
  recalcAll,
  replayRatings,
  updateRating,
  type GlickoState,
} from '../glicko2'
import {
  createCatalogSnapshot,
  createUnknownSnapshot,
  type ScoringFormatSnapshot,
} from '../scoring-format'
import type { Match } from '../../types'

const FMT15 = createCatalogSnapshot('badminton-15-w2-c21')
const LEGACY = createUnknownSnapshot('legacy-missing')
const EXPLICIT_UNKNOWN = createUnknownSnapshot('explicit-unknown')

const mk = (
  id: string,
  scoreA: number,
  scoreB: number,
  scoringFormat: ScoringFormatSnapshot,
  at = 1,
  extra: Partial<Match> = {},
): Match => ({
  id, sessionId: 's1', at, mode: 'doubles',
  teamA: ['a', 'b'], teamB: ['c', 'd'],
  scoreA, scoreB, resters: [], scoringFormat, ...extra,
})

const states = () =>
  new Map<string, GlickoState>([
    ['a', { rating: 1500, rd: 200, vol: 0.06 }],
    ['b', { rating: 1400, rd: 150, vol: 0.06 }],
    ['c', { rating: 1550, rd: 180, vol: 0.06 }],
    ['d', { rating: 1450, rd: 120, vol: 0.06 }],
  ])

describe('performanceScore（已知賽制）', () => {
  it('險勝明顯高於 0.5 但遠低於 1', () => {
    const s = performanceScore(mk('m', 15, 13, FMT15))
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThan(0.8)
    expect(s).toBeCloseTo(0.656, 2)
  })

  it('大勝接近 1', () => {
    expect(performanceScore(mk('m', 15, 5, FMT15))).toBeGreaterThan(0.99)
  })

  it('剃光頭恰為 1，與舊行為相同', () => {
    expect(performanceScore(mk('m', 15, 0, FMT15))).toBe(1)
    expect(performanceScore(mk('m', 0, 15, FMT15))).toBe(0)
  })

  it('兩隊觀測得分互補，總和為 1', () => {
    for (const [a, b] of [[15, 13], [15, 9], [17, 15], [21, 19]] as const) {
      expect(performanceScore(mk('m', a, b, FMT15)) + performanceScore(mk('m', b, a, FMT15)))
        .toBeCloseTo(1, 10)
    }
  })

  it('分差越大，觀測得分越高', () => {
    const scores = [13, 11, 9, 5, 0].map((b) => performanceScore(mk('m', 15, b, FMT15)))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThan(scores[i - 1]!)
    }
  })

  it('平手仍然 throw', () => {
    expect(() => performanceScore(mk('m', 10, 10, FMT15))).toThrow()
  })
})

describe('performanceScore（賽制未知）', () => {
  it('退回二元 1／0，不由比分推導', () => {
    for (const fmt of [LEGACY, EXPLICIT_UNKNOWN]) {
      expect(performanceScore(mk('m', 15, 13, fmt))).toBe(1)
      expect(performanceScore(mk('m', 13, 15, fmt))).toBe(0)
      expect(performanceScore(mk('m', 15, 0, fmt))).toBe(1)
    }
  })
})

describe('applyMatch 與既有行為的相容性', () => {
  it('賽制未知時與變更前的二元路徑逐位元相同', () => {
    // 變更前的等價計算：直接以 score 1／0 呼叫 updateRating
    const before = states()
    const oppB = { rating: (1550 + 1450) / 2, rd: (180 + 120) / 2 }
    const oppA = { rating: (1500 + 1400) / 2, rd: (200 + 150) / 2 }
    const expected = new Map<string, GlickoState>([
      ['a', updateRating(before.get('a')!, [{ ...oppB, score: 1 }])],
      ['b', updateRating(before.get('b')!, [{ ...oppB, score: 1 }])],
      ['c', updateRating(before.get('c')!, [{ ...oppA, score: 0 }])],
      ['d', updateRating(before.get('d')!, [{ ...oppA, score: 0 }])],
    ])
    expect(applyMatch(states(), mk('m', 15, 13, LEGACY))).toEqual(expected)
  })

  it('已知賽制下，分差不同會產生不同結果', () => {
    const narrow = applyMatch(states(), mk('m', 15, 13, FMT15))
    const wide = applyMatch(states(), mk('m', 15, 0, FMT15))
    expect(narrow.get('a')!.rating).not.toBe(wide.get('a')!.rating)
    expect(wide.get('a')!.rating).toBeGreaterThan(narrow.get('a')!.rating)
  })

  it('已知賽制下的大勝與二元路徑一致（觀測得分為 1）', () => {
    expect(applyMatch(states(), mk('m', 15, 0, FMT15)))
      .toEqual(applyMatch(states(), mk('m', 15, 0, LEGACY)))
  })
})

describe('重播', () => {
  const players = [
    { id: 'a', initialRating: 1500 }, { id: 'b', initialRating: 1400 },
    { id: 'c', initialRating: 1550 }, { id: 'd', initialRating: 1450 },
  ]

  it('混合歷史各自依自己的賽制計算', () => {
    const mixed = [mk('m1', 15, 13, LEGACY, 1), mk('m2', 15, 13, FMT15, 2)]
    const allLegacy = [mk('m1', 15, 13, LEGACY, 1), mk('m2', 15, 13, LEGACY, 2)]
    expect(recalcAll(players, mixed)).not.toEqual(recalcAll(players, allLegacy))
  })

  it('全為未知賽制的歷史，結果與二元路徑相同', () => {
    const history = [mk('m1', 15, 13, LEGACY, 1), mk('m2', 21, 3, LEGACY, 2)]
    const binary = [mk('m1', 1, 0, LEGACY, 1), mk('m2', 1, 0, LEGACY, 2)]
    expect(recalcAll(players, history)).toEqual(recalcAll(players, binary))
  })

  it('不計入強度的比賽不論賽制都被略過', () => {
    const excluded = mk('m1', 15, 13, FMT15, 1, { excludedFromRating: true })
    const base = new Map<string, GlickoState>(
      players.map((p) => [p.id, { rating: p.initialRating, rd: DEFAULT_RD, vol: DEFAULT_VOL }]),
    )
    expect(replayRatings(base, [excluded])).toEqual(replayRatings(base, []))
  })

  it('重複重播逐位元相同', () => {
    const history = [mk('m1', 15, 13, FMT15, 1), mk('m2', 17, 15, FMT15, 2)]
    expect(recalcAll(players, history)).toEqual(recalcAll(players, history))
  })
})

describe('分組不得依賴賽制或本模組', () => {
  it('matchmaking.ts 未 import 終局分布或賽制模組', () => {
    expect(matchmakingSource).not.toContain('endpoint-distribution')
    expect(matchmakingSource).not.toContain('scoring-format')
  })
})

/**
 * 分組演算法（純函式）。
 * 規則：公平優先於強度平衡。
 * 1. 自願休息者直接跳過安排（進休息名單）。
 * 2. 當日上場次數較少者優先；次數相同時，連續上場場數較少者優先。
 * 3. 前述條件皆相同時隨機。
 * 4. 在符合公平的上場者中，選兩隊 rating 總和最接近的組合。
 */
import type { Match, Mode, RoundProposal } from '../types'

export interface Candidate {
  id: string
  /** 當日上場次數 */
  playCount: number
  /** 同一場次中，從最近一場向前計算的連續上場場數 */
  consecutivePlayCount: number
  rating: number
  /** 本回合自願休息 */
  volunteerRest?: boolean
}

export type Rng = () => number

/**
 * 從同一活動場次的已完成比賽，推導每位最新仍在連續上場者的連續場數。
 * 未出現在最新一場者不放入 Map，呼叫端視為 0。
 */
export function consecutivePlayCounts(matches: readonly Match[]): Map<string, number> {
  const ordered = matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => b.match.at - a.match.at || b.index - a.index)
    .map(({ match }) => match)

  const latest = ordered[0]
  if (!latest) return new Map()

  const latestPlayers = new Set([...latest.teamA, ...latest.teamB])
  const counts = new Map<string, number>()
  for (const playerId of latestPlayers) {
    let count = 0
    for (const match of ordered) {
      if (!match.teamA.includes(playerId) && !match.teamB.includes(playerId)) break
      count++
    }
    counts.set(playerId, count)
  }
  return counts
}

/** Fisher–Yates 洗牌（不改動原陣列） */
function shuffled<T>(xs: readonly T[], rng: Rng): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** 在固定的上場者中，找兩隊 rating 總和最接近的分法 */
export function balanceTeams(
  playing: readonly Candidate[],
  mode: Mode,
): { teamA: string[]; teamB: string[] } {
  if (mode === 'singles') {
    return { teamA: [playing[0]!.id], teamB: [playing[1]!.id] }
  }
  const [p0, p1, p2, p3] = playing as [Candidate, Candidate, Candidate, Candidate]
  const splits: [Candidate[], Candidate[]][] = [
    [[p0, p1], [p2, p3]],
    [[p0, p2], [p1, p3]],
    [[p0, p3], [p1, p2]],
  ]
  let best = splits[0]!
  let bestDiff = Infinity
  for (const s of splits) {
    const diff = Math.abs(
      s[0].reduce((t, p) => t + p.rating, 0) - s[1].reduce((t, p) => t + p.rating, 0),
    )
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return { teamA: best[0].map((p) => p.id), teamB: best[1].map((p) => p.id) }
}

/**
 * 產生下一場分組。
 * @param candidates 目前在場人員（含統計）
 * @returns 分組＋休息名單；在場可上場人數不足時回傳 null
 */
export function generateRound(
  candidates: readonly Candidate[],
  mode: Mode,
  rng: Rng = Math.random,
): RoundProposal | null {
  const need = mode === 'doubles' ? 4 : 2
  const volunteers = candidates.filter((c) => c.volunteerRest)
  const eligible = candidates.filter((c) => !c.volunteerRest)
  if (eligible.length < need) return null

  // 先隨機洗牌，再依上場次數與連續上場場數穩定排序 → 完全並列者隨機排列
  const ordered = shuffled(eligible, rng).sort(
    (a, b) =>
      a.playCount - b.playCount || a.consecutivePlayCount - b.consecutivePlayCount,
  )
  const playing = ordered.slice(0, need)
  const resters = [...ordered.slice(need), ...volunteers].map((c) => c.id)

  const { teamA, teamB } = balanceTeams(playing, mode)
  return { mode, teamA, teamB, resters }
}

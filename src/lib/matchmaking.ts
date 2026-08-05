/**
 * 分組演算法（純函式）。
 * 規則：公平優先於強度平衡。
 * 1. 自願休息者直接跳過安排（進休息名單）。
 * 2. 需休息時，挑「當日上場次數最多者」休息；並列時隨機。
 *    （等價於：上場次數最少者優先上場。）
 * 3. 在符合公平的上場者中，選兩隊 rating 總和最接近的組合。
 */
import type { Mode, RoundProposal } from '../types'

export interface Candidate {
  id: string
  /** 當日上場次數 */
  playCount: number
  rating: number
  /** 本回合自願休息 */
  volunteerRest?: boolean
}

export type Rng = () => number

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

  // 先隨機洗牌再依 playCount 穩定排序 → 並列者隨機排列
  const ordered = shuffled(eligible, rng).sort((a, b) => a.playCount - b.playCount)
  const playing = ordered.slice(0, need)
  const resters = [...ordered.slice(need), ...volunteers].map((c) => c.id)

  const { teamA, teamB } = balanceTeams(playing, mode)
  return { mode, teamA, teamB, resters }
}

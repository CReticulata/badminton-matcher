/**
 * 分組演算法（純函式）。
 * 規則：公平優先於強度平衡。
 * 1. 自願休息者直接跳過安排（進休息名單）。
 * 2. 上場率公平層較低者優先；同層時，連續上場場數較少者優先。
 * 3. 在公平完全並列者中，聯合決定「誰上場」與「怎麼分隊」，取兩隊 rating 總和最接近者。
 * 4. 差距在容差內的選項視為等價，隨機挑一個以保留配對變化。
 */
import type { Match, Mode, RoundProposal } from '../types'
import { orderMatchesByCompletionSequence } from './rotation-chronology'

export interface Candidate {
  id: string
  /** 當日上場次數；fairness-degraded / legacy fallback only. */
  playCount: number
  /** Precise current-period appearances/hour. Undefined preserves legacy fallback. */
  ratePerHour?: number
  /** 同一場次中，從最近一場向前計算的連續上場場數 */
  consecutivePlayCount: number
  rating: number
  /** 本回合自願休息 */
  volunteerRest?: boolean
}

export type Rng = () => number

/**
 * 平衡容差：兩隊 rating 總和差在此範圍內的選項視為等價，隨機挑一個。
 *
 * 目的是配對變化，不是保護強弱極端者——後者由上場率公平層與連續上場鍵負責；
 * Rating 不得推翻較嚴格的公平順位。
 *
 * 取 25 的依據：以實際名單十人全部並列量測，容差 0 時只有 2 個等價選項、僅涵蓋
 * 5 人；容差 25 時 37 個選項涵蓋全部 10 人，而最差被接受的選項總和差為 26 點，
 * 換算約 0.03 分的預期分差差異。見 docs/research/score-aware-margin-calibration.md。
 */
export const BALANCE_TOLERANCE = 25
export const DEFAULT_FAIRNESS_BAND = 0.5

/**
 * 聯合搜尋的組合數上限。超過時退回既有行為（公平排序取前 N 人再分隊），
 * 而不是靜默截斷——截斷會讓不完整的搜尋看起來像完整的。
 */
export const MAX_ENUMERATED_GROUPS = 10_000

export interface RoundDiagnostics {
  /** 因並列群過大而未執行聯合搜尋 */
  wideSearchSkipped: boolean
  /** 實際列舉的候選組合數 */
  enumeratedGroups: number
}

/**
 * 從同一活動場次的已完成比賽，推導每位最新仍在連續上場者的連續場數。
 * 未出現在最新一場者不放入 Map，呼叫端視為 0。
 */
export function consecutivePlayCounts(matches: readonly Match[]): Map<string, number> {
  const first = matches[0]
  if (!first) return new Map()
  const ordered = orderMatchesByCompletionSequence(matches, first.sessionId).reverse()
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

/** 在固定的上場者中，找兩隊 rating 總和最接近的分法，並回報其差距 */
function bestSplit(
  playing: readonly Candidate[],
  mode: Mode,
): { teamA: string[]; teamB: string[]; gap: number } {
  if (mode === 'singles') {
    const [p0, p1] = playing as [Candidate, Candidate]
    return { teamA: [p0.id], teamB: [p1.id], gap: Math.abs(p0.rating - p1.rating) }
  }
  const [p0, p1, p2, p3] = playing as [Candidate, Candidate, Candidate, Candidate]
  const splits: [Candidate[], Candidate[]][] = [
    [[p0, p1], [p2, p3]],
    [[p0, p2], [p1, p3]],
    [[p0, p3], [p1, p2]],
  ]
  let best = splits[0]!
  let bestGap = Infinity
  for (const s of splits) {
    const gap = Math.abs(
      s[0].reduce((t, p) => t + p.rating, 0) - s[1].reduce((t, p) => t + p.rating, 0),
    )
    if (gap < bestGap) {
      bestGap = gap
      best = s
    }
  }
  return { teamA: best[0].map((p) => p.id), teamB: best[1].map((p) => p.id), gap: bestGap }
}

/** 在固定的上場者中，找兩隊 rating 總和最接近的分法 */
export function balanceTeams(
  playing: readonly Candidate[],
  mode: Mode,
): { teamA: string[]; teamB: string[] } {
  const { teamA, teamB } = bestSplit(playing, mode)
  return { teamA, teamB }
}

/** 在不改變固定上場集合的前提下，從 best + 25 的等價分隊中依注入亂數選一組。 */
export function splitFixedPlayingSet(
  playing: readonly Candidate[],
  mode: Mode,
  rng: Rng = Math.random,
  maximumGap = Infinity,
): { teamA: string[]; teamB: string[] } {
  const need = mode === 'doubles' ? 4 : 2
  if (
    playing.length !== need ||
    new Set(playing.map((candidate) => candidate.id)).size !== need
  ) {
    throw new Error(`Fixed ${mode} playing set must contain exactly ${need} unique participants`)
  }

  if (mode === 'singles') {
    return { teamA: [playing[0]!.id], teamB: [playing[1]!.id] }
  }

  const [p0, p1, p2, p3] = playing as readonly [
    Candidate,
    Candidate,
    Candidate,
    Candidate,
  ]
  const candidates = [
    { teamA: [p0, p1], teamB: [p2, p3] },
    { teamA: [p0, p2], teamB: [p1, p3] },
    { teamA: [p0, p3], teamB: [p1, p2] },
  ].map((split) => ({
    ...split,
    gap: Math.abs(
      split.teamA.reduce((total, candidate) => total + candidate.rating, 0) -
        split.teamB.reduce((total, candidate) => total + candidate.rating, 0),
    ),
  }))
  const bestGap = Math.min(...candidates.map((candidate) => candidate.gap))
  const equivalent = candidates.filter(
    (candidate) =>
      candidate.gap <= bestGap + BALANCE_TOLERANCE && candidate.gap <= maximumGap,
  )
  const picked = equivalent[
    Math.min(equivalent.length - 1, Math.floor(rng() * equivalent.length))
  ]!
  return {
    teamA: picked.teamA.map((candidate) => candidate.id),
    teamB: picked.teamB.map((candidate) => candidate.id),
  }
}

export interface ApplyRotationWildcardInput {
  normalProposal: RoundProposal
  candidates: readonly Candidate[]
  completedPlayingSets: readonly (readonly string[])[]
  cooldownRemaining: number
  fairnessReliable: boolean
  rng: Rng
}

/** Pure post-selection transform. Store/UI integration remains separately gated. */
export function applyRotationWildcard(
  input: ApplyRotationWildcardInput,
): RoundProposal {
  const normalPlayingIds = canonicalIds([
    ...input.normalProposal.teamA,
    ...input.normalProposal.teamB,
  ])
  const twoBack = input.completedPlayingSets.at(-2)
  if (
    !twoBack ||
    !sameIds(normalPlayingIds, canonicalIds(twoBack)) ||
    input.cooldownRemaining > 0 ||
    !input.fairnessReliable
  ) {
    return input.normalProposal
  }

  const normalSet = new Set(normalPlayingIds)
  const eligibleOutsiders = input.candidates.filter(
    (candidate) => !candidate.volunteerRest && !normalSet.has(candidate.id),
  )
  if (eligibleOutsiders.length === 0) return input.normalProposal

  const probability = input.normalProposal.mode === 'doubles' ? 0.25 : 0.125
  if (input.rng() >= probability) return input.normalProposal

  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]))
  const normalCandidates = normalPlayingIds.map((id) => {
    const candidate = byId.get(id)
    if (!candidate) throw new Error(`Normal proposal participant is not eligible: ${id}`)
    return candidate
  })
  const exchangedOut = normalCandidates[pickIndex(normalCandidates.length, input.rng)]!
  const exchangedIn = eligibleOutsiders[pickIndex(eligibleOutsiders.length, input.rng)]!
  const finalCandidates = normalCandidates
    .filter((candidate) => candidate.id !== exchangedOut.id)
    .concat(exchangedIn)
  const { teamA, teamB } = splitFixedPlayingSet(
    finalCandidates,
    input.normalProposal.mode,
    input.rng,
  )
  const playingSet = new Set([...teamA, ...teamB])
  return {
    mode: input.normalProposal.mode,
    teamA,
    teamB,
    resters: input.candidates
      .filter((candidate) => !playingSet.has(candidate.id))
      .map((candidate) => candidate.id),
    rotationWildcard: {
      schemaVersion: 1,
      normalPlayingIds,
      exchangedOutId: exchangedOut.id,
      exchangedInId: exchangedIn.id,
    },
  }
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length))
}

function canonicalIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

const fairnessKey = (c: Candidate, layer: number) => `${layer}:${c.consecutivePlayCount}`

/** Minimum-anchored fixed-band layers (not pairwise chained buckets). */
export function rateLayers(
  candidates: readonly Candidate[],
  fairnessBand = DEFAULT_FAIRNESS_BAND,
): Map<string, number> {
  if (!Number.isFinite(fairnessBand) || fairnessBand < 0) {
    throw new Error('Fairness band must be a finite non-negative number')
  }
  const layers = new Map<string, number>()
  const ordered = [...candidates].sort((a, b) => (a.ratePerHour ?? 0) - (b.ratePerHour ?? 0))
  let index = 0
  let layer = 0
  while (index < ordered.length) {
    const anchor = ordered[index]!.ratePerHour ?? 0
    while (
      index < ordered.length &&
      (ordered[index]!.ratePerHour ?? 0) <= anchor + fairnessBand
    ) {
      layers.set(ordered[index]!.id, layer)
      index++
    }
    layer++
  }
  return layers
}

/** C(n, k)，用於在列舉前判斷是否超過上限 */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1)
  return Math.round(result)
}

/** 依序產生 items 中所有 k 個元素的組合 */
function* combinations<T>(items: readonly T[], k: number): Generator<T[]> {
  const idx = Array.from({ length: k }, (_, i) => i)
  if (k > items.length) return
  for (;;) {
    yield idx.map((i) => items[i]!)
    let i = k - 1
    while (i >= 0 && idx[i] === items.length - k + i) i--
    if (i < 0) return
    idx[i]!++
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1
  }
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
  diagnostics?: RoundDiagnostics,
  fairnessBand = DEFAULT_FAIRNESS_BAND,
): RoundProposal | null {
  const need = mode === 'doubles' ? 4 : 2
  const volunteers = candidates.filter((c) => c.volunteerRest)
  const eligible = candidates.filter((c) => !c.volunteerRest)
  if (eligible.length < need) return null

  // Build rate layers before random ordering; absent rate explicitly retains legacy count fairness.
  const layers = eligible.some((candidate) => candidate.ratePerHour !== undefined)
    ? rateLayers(eligible, fairnessBand)
    : new Map(eligible.map((candidate) => [candidate.id, candidate.playCount]))
  const ordered = shuffled(eligible, rng).sort(
    (a, b) =>
      (layers.get(a.id)! - layers.get(b.id)!) || a.consecutivePlayCount - b.consecutivePlayCount,
  )

  // 公平已判定嚴格較優者無條件上場；只有「邊界並列群」需要決定誰上
  const admitted: Candidate[] = []
  let index = 0
  while (index < ordered.length) {
    const key = fairnessKey(ordered[index]!, layers.get(ordered[index]!.id)!)
    const group: Candidate[] = []
    while (index < ordered.length && fairnessKey(ordered[index]!, layers.get(ordered[index]!.id)!) === key) {
      group.push(ordered[index]!)
      index++
    }
    if (admitted.length + group.length > need) {
      index -= group.length
      break
    }
    admitted.push(...group)
    if (admitted.length === need) break
  }
  // 邊界群：與第一個未被無條件排入者公平完全並列的連續區段（ordered 已依公平鍵排序）
  const boundary: Candidate[] = []
  if (index < ordered.length) {
    const key = fairnessKey(ordered[index]!, layers.get(ordered[index]!.id)!)
    for (let i = index; i < ordered.length && fairnessKey(ordered[i]!, layers.get(ordered[i]!.id)!) === key; i++) {
      boundary.push(ordered[i]!)
    }
  }
  const remaining = need - admitted.length

  const finish = (playing: readonly Candidate[], maximumGap = Infinity) => {
    const playingIds = new Set(playing.map((c) => c.id))
    const resters = [
      ...ordered.filter((c) => !playingIds.has(c.id)),
      ...volunteers,
    ].map((c) => c.id)
    const { teamA, teamB } = splitFixedPlayingSet(playing, mode, rng, maximumGap)
    return { mode, teamA, teamB, resters }
  }

  if (remaining === 0) {
    if (diagnostics) {
      diagnostics.wideSearchSkipped = false
      diagnostics.enumeratedGroups = 1
    }
    return finish(admitted)
  }

  // 並列群過大時退回既有行為，而不是截斷搜尋
  const total = choose(boundary.length, remaining)
  if (total > MAX_ENUMERATED_GROUPS) {
    if (diagnostics) {
      diagnostics.wideSearchSkipped = true
      diagnostics.enumeratedGroups = 0
    }
    return finish(ordered.slice(0, need))
  }

  let bestGap = Infinity
  const options: { playing: Candidate[]; gap: number }[] = []
  // eligible.length >= need 保證邊界群足以補滿；防禦性退回既有行為
  if (boundary.length < remaining) return finish(ordered.slice(0, need))
  for (const combo of combinations(boundary, remaining)) {
    const playing = [...admitted, ...combo]
    const { gap } = bestSplit(playing, mode)
    if (gap < bestGap) bestGap = gap
    options.push({ playing, gap })
  }
  if (diagnostics) {
    diagnostics.wideSearchSkipped = false
    diagnostics.enumeratedGroups = options.length
  }

  // 容差內視為等價，隨機挑一個以保留配對變化
  const equivalent = options.filter((o) => o.gap <= bestGap + BALANCE_TOLERANCE)
  const picked = equivalent[Math.min(equivalent.length - 1, Math.floor(rng() * equivalent.length))]!
  return finish(picked.playing, bestGap + BALANCE_TOLERANCE)
}

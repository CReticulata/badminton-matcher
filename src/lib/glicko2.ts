/**
 * 標準 Glicko-2 實作（Glickman, "Example of the Glicko-2 system"）。
 * - 每場比賽視為一個 rating period，打完即時更新。
 * - 雙打映射：每位球員以「對方兩人 rating/RD 平均」為單一虛擬對手更新。
 * - tau = 0.5。
 */
import type { Match, Player, RatingBaseline, RatingOverride } from '../types'

export const TAU = 0.5
export const DEFAULT_RATING = 1500
export const DEFAULT_RD = 350
export const DEFAULT_VOL = 0.06
/** 手動覆寫 rating 後，RD 重設為高值（視為重新認識此人） */
export const OVERRIDE_RD = 350

const SCALE = 173.7178
const EPS = 1e-6

export interface GlickoState {
  rating: number
  rd: number
  vol: number
}

export interface GlickoResult {
  /** 對手 rating */
  rating: number
  /** 對手 RD */
  rd: number
  /** 我方得分：1 勝、0 敗、0.5 和 */
  score: number
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)))
}

/** 依一個 rating period 的對戰結果更新單一玩家（純函式） */
export function updateRating(
  player: GlickoState,
  results: GlickoResult[],
  tau: number = TAU,
): GlickoState {
  const mu = (player.rating - DEFAULT_RATING) / SCALE
  const phi = player.rd / SCALE
  const sigma = player.vol

  if (results.length === 0) {
    // 沒有比賽：只擴大 RD（step 6 的變形）
    const phiStar = Math.sqrt(phi * phi + sigma * sigma)
    return { rating: player.rating, rd: phiStar * SCALE, vol: sigma }
  }

  // Step 3: v
  let vInv = 0
  for (const r of results) {
    const muJ = (r.rating - DEFAULT_RATING) / SCALE
    const phiJ = r.rd / SCALE
    const e = E(mu, muJ, phiJ)
    const gj = g(phiJ)
    vInv += gj * gj * e * (1 - e)
  }
  const v = 1 / vInv

  // Step 4: delta
  let sum = 0
  for (const r of results) {
    const muJ = (r.rating - DEFAULT_RATING) / SCALE
    const phiJ = r.rd / SCALE
    sum += g(phiJ) * (r.score - E(mu, muJ, phiJ))
  }
  const delta = v * sum

  // Step 5: 以 Illinois 演算法求新 volatility
  const a = Math.log(sigma * sigma)
  const f = (x: number): number => {
    const ex = Math.exp(x)
    const phi2 = phi * phi
    const num = ex * (delta * delta - phi2 - v - ex)
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex)
    return num / den - (x - a) / (tau * tau)
  }

  let A = a
  let B: number
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * tau) < 0) k++
    B = a - k * tau
  }
  let fA = f(A)
  let fB = f(B)
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
  }
  const sigmaPrime = Math.exp(A / 2)

  // Step 6, 7
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime)
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const muPrime = mu + phiPrime * phiPrime * sum

  return {
    rating: muPrime * SCALE + DEFAULT_RATING,
    rd: phiPrime * SCALE,
    vol: sigmaPrime,
  }
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/**
 * 這場比賽是否計入強度。強制記錄的不合賽制比賽不計入。
 * 所有會把比賽套用到 rating 的路徑都必須經過這個判定，不可各自實作。
 */
export function countsForRating(match: Pick<Match, 'excludedFromRating'>): boolean {
  return match.excludedFromRating !== true
}

/**
 * 依一場比賽計算所有上場者的新 rating（純函式）。
 * 傳回 Map<playerId, GlickoState>，未上場者不在其中。
 * 所有更新皆以賽前狀態為基準（同一 period 內互不影響）。
 */
export function applyMatch(
  states: ReadonlyMap<string, GlickoState>,
  match: Pick<Match, 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>,
): Map<string, GlickoState> {
  const updated = new Map<string, GlickoState>()
  const get = (id: string): GlickoState => {
    const s = states.get(id)
    if (!s) throw new Error(`unknown player id: ${id}`)
    return s
  }
  const scoreOf = (myTeamIsA: boolean): number => {
    if (match.scoreA === match.scoreB) throw new Error('score cannot be a tie')
    const aWins = match.scoreA > match.scoreB
    return myTeamIsA === aWins ? 1 : 0
  }

  const virtualOpponent = (oppIds: string[]): { rating: number; rd: number } => {
    const opps = oppIds.map(get)
    return { rating: avg(opps.map((o) => o.rating)), rd: avg(opps.map((o) => o.rd)) }
  }

  for (const id of match.teamA) {
    const opp = virtualOpponent(match.teamB)
    updated.set(id, updateRating(get(id), [{ ...opp, score: scoreOf(true) }]))
  }
  for (const id of match.teamB) {
    const opp = virtualOpponent(match.teamA)
    updated.set(id, updateRating(get(id), [{ ...opp, score: scoreOf(false) }]))
  }
  return updated
}

/**
 * 從完整比賽歷史（＋手動覆寫事件）全量重算所有人的 rating。
 * 修改／刪除歷史紀錄後呼叫，保證 rating 與紀錄一致。
 * 傳回 Map<playerId, GlickoState>。
 */
export function recalcAll(
  players: readonly Pick<Player, 'id' | 'initialRating'>[],
  matches: readonly Match[],
  overrides: readonly RatingOverride[] = [],
  baselines: readonly RatingBaseline[] = [],
): Map<string, GlickoState> {
  const states = new Map<string, GlickoState>()
  for (const p of players) {
    states.set(p.id, { rating: p.initialRating, rd: DEFAULT_RD, vol: DEFAULT_VOL })
  }

  return replayRatings(states, matches, overrides, baselines)
}

/** 從指定的完整 Glicko 狀態重播事件，供活動開場邊界後續事件使用。 */
export function replayRatings(
  initialStates: ReadonlyMap<string, GlickoState>,
  matches: readonly Match[],
  overrides: readonly RatingOverride[] = [],
  baselines: readonly RatingBaseline[] = [],
): Map<string, GlickoState> {
  const states = new Map<string, GlickoState>()
  for (const [id, state] of initialStates) states.set(id, { ...state })

  type Event =
    | { at: number; kind: 'match'; match: Match }
    | { at: number; kind: 'override'; override: RatingOverride }
    | { at: number; kind: 'baseline'; baseline: RatingBaseline }
  const events: Event[] = [
    ...matches.map((m) => ({ at: m.at, kind: 'match' as const, match: m })),
    ...overrides.map((o) => ({ at: o.at, kind: 'override' as const, override: o })),
    ...baselines.map((b) => ({ at: b.at, kind: 'baseline' as const, baseline: b })),
  ].sort((a, b) => a.at - b.at)

  for (const ev of events) {
    if (ev.kind === 'override') {
      if (states.has(ev.override.playerId)) {
        states.set(ev.override.playerId, {
          rating: ev.override.rating,
          rd: OVERRIDE_RD,
          vol: DEFAULT_VOL,
        })
      }
    } else if (ev.kind === 'baseline') {
      // 固化基準：完整覆寫 rating／rd／vol，還原清除歷史前的狀態
      if (states.has(ev.baseline.playerId)) {
        states.set(ev.baseline.playerId, {
          rating: ev.baseline.rating,
          rd: ev.baseline.rd,
          vol: ev.baseline.vol,
        })
      }
    } else if (countsForRating(ev.match)) {
      const changed = applyMatch(states, ev.match)
      for (const [id, s] of changed) states.set(id, s)
    }
  }
  return states
}

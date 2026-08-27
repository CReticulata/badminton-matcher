import type { Match, RatingBaseline, RatingOverride, RatingSnapshot, Session } from '../types'
import { applyMatch, countsForRating, DEFAULT_VOL, OVERRIDE_RD, type GlickoState } from './glicko2'

export interface SessionSummaryRow {
  playerId: string
  openingRating: number
  endingRating: number
  delta: number
  addedDuringSession: boolean
}

export interface SessionRatingReport {
  matchChanges: Map<string, Record<string, number>>
  endingStates: Map<string, GlickoState>
  summaryReliable: boolean
  summary: SessionSummaryRow[]
}

const cloneState = (state: RatingSnapshot): GlickoState => ({ ...state })
const rounded = (rating: number) => Math.round(rating)

/**
 * 從活動固定開場狀態重播該活動的比賽。
 * 開場資料不完整時回傳 null，避免顯示不可靠的部分摘要。
 */
export function sessionRatingReport(
  session: Session,
  matches: readonly Match[],
  overrides: readonly RatingOverride[] = [],
  baselines: readonly RatingBaseline[] = [],
): SessionRatingReport | null {
  const opening = session.openingRatings
  const participantIds = session.participantIds
  if (!opening || !participantIds) return null
  if (participantIds.some((id) => !opening[id])) return null

  const states = new Map<string, GlickoState>()
  for (const [id, state] of Object.entries(opening)) states.set(id, cloneState(state))

  const endsAt = session.endedAt ?? Infinity
  const inSessionWindow = (at: number) => at >= session.startedAt && at <= endsAt
  type SessionEvent =
    | { at: number; kind: 'match'; match: Match }
    | { at: number; kind: 'override'; override: RatingOverride }
    | { at: number; kind: 'baseline'; baseline: RatingBaseline }
  const ordered: SessionEvent[] = [
    ...matches
      .filter((match) => match.sessionId === session.id && match.at <= endsAt)
      .map((match) => ({ at: match.at, kind: 'match' as const, match })),
    ...overrides
      .filter((override) => inSessionWindow(override.at))
      .map((override) => ({ at: override.at, kind: 'override' as const, override })),
    ...baselines
      .filter((baseline) => inSessionWindow(baseline.at))
      .map((baseline) => ({ at: baseline.at, kind: 'baseline' as const, baseline })),
  ].sort((a, b) => a.at - b.at)

  const matchChanges = new Map<string, Record<string, number>>()
  for (const event of ordered) {
    if (event.kind === 'override') {
      if (states.has(event.override.playerId)) {
        states.set(event.override.playerId, {
          rating: event.override.rating,
          rd: OVERRIDE_RD,
          vol: DEFAULT_VOL,
        })
      }
      continue
    }
    if (event.kind === 'baseline') {
      if (states.has(event.baseline.playerId)) {
        states.set(event.baseline.playerId, {
          rating: event.baseline.rating,
          rd: event.baseline.rd,
          vol: event.baseline.vol,
        })
      }
      continue
    }
    const match = event.match
    const playerIds = [...match.teamA, ...match.teamB]
    if (playerIds.some((id) => !states.has(id))) return null

    // 不計入強度者不改變狀態，也不留下 delta——UI 藉此顯示「不計入強度」而非 0
    if (!countsForRating(match)) continue

    const updated = applyMatch(states, match)
    const changes: Record<string, number> = {}
    for (const [id, next] of updated) {
      changes[id] = rounded(next.rating) - rounded(states.get(id)!.rating)
      states.set(id, next)
    }
    matchChanges.set(match.id, changes)
  }

  const added = new Set(session.addedDuringSessionIds ?? [])
  const summaryReliable = session.participantOrderReliable !== false
  const summary = summaryReliable
    ? participantIds
        .map((playerId, joinedIndex): SessionSummaryRow & { joinedIndex: number } => {
          const start = opening[playerId]!
          const end = states.get(playerId) ?? cloneState(start)
          const openingRating = rounded(start.rating)
          const endingRating = rounded(end.rating)
          return {
            playerId,
            openingRating,
            endingRating,
            delta: endingRating - openingRating,
            addedDuringSession: added.has(playerId),
            joinedIndex,
          }
        })
        .sort((a, b) => b.delta - a.delta || a.joinedIndex - b.joinedIndex)
        .map(({ joinedIndex: _joinedIndex, ...row }) => row)
    : []

  return { matchChanges, endingStates: states, summaryReliable, summary }
}

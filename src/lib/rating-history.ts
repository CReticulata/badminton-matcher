import type { Match, RatingSnapshot, Session } from '../types'
import { applyMatch, type GlickoState } from './glicko2'

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
): SessionRatingReport | null {
  const opening = session.openingRatings
  const participantIds = session.participantIds
  if (!opening || !participantIds) return null
  if (participantIds.some((id) => !opening[id])) return null

  const states = new Map<string, GlickoState>()
  for (const [id, state] of Object.entries(opening)) states.set(id, cloneState(state))

  const ordered = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.sessionId === session.id)
    .sort((a, b) => a.match.at - b.match.at || a.index - b.index)

  const matchChanges = new Map<string, Record<string, number>>()
  for (const { match } of ordered) {
    const playerIds = [...match.teamA, ...match.teamB]
    if (playerIds.some((id) => !states.has(id))) return null

    const updated = applyMatch(states, match)
    const changes: Record<string, number> = {}
    for (const [id, next] of updated) {
      changes[id] = rounded(next.rating) - rounded(states.get(id)!.rating)
      states.set(id, next)
    }
    matchChanges.set(match.id, changes)
  }

  const added = new Set(session.addedDuringSessionIds ?? [])
  const summary = participantIds
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

  return { matchChanges, endingStates: states, summary }
}

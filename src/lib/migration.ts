import type { AppData, RatingSnapshot } from '../types'
import { DEFAULT_RD, DEFAULT_VOL, recalcAll } from './glicko2'

const unique = (ids: readonly string[]) => [...new Set(ids)]

/** 一次性補齊舊活動資料；既有固定快照絕不覆寫。 */
export function migrateAppData(data: AppData, migrationTime = Date.now()): AppData {
  const playersById = new Map(data.players.map((player) => [player.id, player]))

  for (const session of [...data.sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const sessionMatches = data.matches
      .filter((match) => match.sessionId === session.id)
      .sort((a, b) => a.at - b.at)
    const inferredParticipants = unique([
      ...session.presentIds,
      ...session.leftIds,
      ...sessionMatches.flatMap((match) => [...match.teamA, ...match.teamB, ...match.resters]),
    ])

    if (session.participantIds === undefined) {
      session.participantIds = inferredParticipants
      session.participantOrderReliable = false
    }
    session.addedDuringSessionIds ??= session.participantIds.filter(
      (id) => (playersById.get(id)?.createdAt ?? -Infinity) > session.startedAt,
    )
    if (!session.active && session.endedAt == null) {
      session.endedAt = sessionMatches.reduce(
        (latest, match) => Math.max(latest, match.at),
        session.startedAt,
      )
    }
    // Legacy active sessions have no trustworthy historical attendance.  Start an
    // explicit suffix at migration time; ended sessions intentionally remain untouched.
    if (session.active && (session.attendanceEvents === undefined || (session.attendanceEvents.length === 0 && session.presentIds.length > 0))) {
      const boundaryId = `fairness-migration-${session.id}`
      const presentIds = unique(session.presentIds)
      const presentSet = new Set(presentIds)
      const volunteerRestIds = unique(session.volunteerRest).filter((id) => presentSet.has(id))
      session.presentIds = presentIds
      session.volunteerRest = volunteerRestIds
      session.attendanceEvents = [
        { id: boundaryId, sessionId: session.id, kind: 'fairness-recovery-boundary', at: migrationTime, sequence: 0, presentIds, volunteerRestIds },
        ...presentIds.map((playerId, index) => ({ id: `${boundaryId}-${playerId}`, sessionId: session.id, kind: 'fairness-period-started' as const, playerId, at: migrationTime, sequence: index + 1 })),
      ]
    }

    if (session.openingRatings) continue
    if (session.participantIds.some((id) => !playersById.has(id))) continue

    try {
      const statesAtStart = recalcAll(
        data.players,
        data.matches.filter((match) => match.at < session.startedAt),
        data.overrides.filter((override) => override.at < session.startedAt),
        data.baselines.filter((baseline) => baseline.at < session.startedAt),
      )
      const openingRatings: Record<string, RatingSnapshot> = {}
      for (const player of data.players) {
        if (player.createdAt <= session.startedAt) {
          const state = statesAtStart.get(player.id)
          if (!state) throw new Error(`missing state for ${player.id}`)
          openingRatings[player.id] = { ...state }
        }
      }
      for (const id of session.addedDuringSessionIds) {
        const player = playersById.get(id)!
        openingRatings[id] = {
          rating: player.initialRating,
          rd: DEFAULT_RD,
          vol: DEFAULT_VOL,
        }
      }
      if (session.participantIds.some((id) => !openingRatings[id])) continue
      session.openingRatings = openingRatings
    } catch {
      // 保留原始歷史，但不建立不可靠的部分快照。
    }
  }

  return data
}

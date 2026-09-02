/**
 * 把未信任的 localStorage／CSV 內容正規化成 AppData。
 *
 * 缺少賽制欄位＝舊資料，補成 legacy-missing；已宣告但格式錯誤或與比分矛盾＝壞資料，
 * 整批拒絕。兩者不可混為一談：把壞資料降級成「未知」會讓損毀看起來像正常的舊紀錄。
 */
import type { AppData, Match, MatchContext, ScoringFormatSnapshot, Session } from '../types'
import {
  createUnknownSnapshot,
  isLegalEndpoint,
  isStructured,
  reconstructScoringFormat,
} from './scoring-format'
import { assertValidCompletionChronology } from './rotation-chronology'
import { cloneValidatedRotationWildcardLineage } from './rotation-wildcard-lineage'

function asArray(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必須是陣列`)
  return value
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 必須是物件`)
  }
  return value as Record<string, unknown>
}

function assertCausalTimestamp(value: unknown, field: string): asserts value is number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 0
    || (value as number) >= Number.MAX_SAFE_INTEGER
  ) throw new Error(`${field} timestamp 必須是可安全遞增的非負整數`)
}

/** 缺欄位→legacy-missing；有欄位→嚴格重建（失敗即 throw） */
function normalizeFormat(value: unknown, field: string): ScoringFormatSnapshot {
  if (value === undefined || value === null) return createUnknownSnapshot('legacy-missing')
  try {
    return reconstructScoringFormat(value)
  } catch (error) {
    throw new Error(`${field} 的賽制快照無效：${(error as Error).message}`)
  }
}

function normalizeRotationWildcard(
  value: unknown,
  proposal: Pick<MatchContext, 'mode' | 'teamA' | 'teamB'>,
  field: string,
) {
  if (value === undefined) return undefined
  const raw = asRecord(value, field)
  const lineage = {
    schemaVersion: raw.schemaVersion,
    normalPlayingIds: asArray(raw.normalPlayingIds, `${field}.normalPlayingIds`),
    exchangedOutId: raw.exchangedOutId,
    exchangedInId: raw.exchangedInId,
  } as MatchContext['rotationWildcard']
  const validated = cloneValidatedRotationWildcardLineage({ ...proposal, rotationWildcard: lineage })
  if (!validated) throw new Error(`${field} 的 rotation wildcard lineage 無效`)
  return validated
}

function normalizeLiveMatch(value: unknown, field: string): MatchContext | undefined {
  if (value === undefined || value === null) return undefined
  const live = asRecord(value, field)
  assertCausalTimestamp(live.startedAt, `${field}.startedAt`)
  const mode = live.mode
  const teamA = asArray(live.teamA, `${field}.teamA`)
  const teamB = asArray(live.teamB, `${field}.teamB`)
  const resters = asArray(live.resters, `${field}.resters`)
  const allIds = [...teamA, ...teamB, ...resters]
  if (
    (mode !== 'singles' && mode !== 'doubles')
    || allIds.some((id) => typeof id !== 'string' || !id)
    || typeof live.liveMatchId !== 'string' || !live.liveMatchId
  ) throw new Error(`${field} 無效`)
  const lineup = [...teamA, ...teamB] as string[]
  if (new Set(lineup).size !== lineup.length) throw new Error(`${field} 的上場名單重複`)
  const lineage = live.fairnessPeriodIds === undefined
    ? undefined
    : asRecord(live.fairnessPeriodIds, `${field}.fairnessPeriodIds`)
  if (lineage && (
    Object.keys(lineage).length !== lineup.length
    || lineup.some((playerId) => typeof lineage[playerId] !== 'string' || !lineage[playerId])
    || Object.keys(lineage).some((playerId) => !lineup.includes(playerId))
  )) {
    throw new Error(`${field} 的公平 lineage 無效`)
  }
  const rotationWildcard = normalizeRotationWildcard(
    live.rotationWildcard,
    { mode: mode as MatchContext['mode'], teamA: teamA as string[], teamB: teamB as string[] },
    `${field}.rotationWildcard`,
  )
  return {
    mode,
    teamA: teamA as string[], teamB: teamB as string[], resters: resters as string[],
    scoringFormat: normalizeFormat(live.scoringFormat, `${field}.scoringFormat`),
    liveMatchId: live.liveMatchId,
    startedAt: live.startedAt as number,
    fairnessPeriodIds: lineage as Record<string, string> | undefined,
    ...(rotationWildcard ? { rotationWildcard } : {}),
  }
}

export function normalizeAppData(raw: unknown): AppData {
  const root = asRecord(raw, '資料')

  const sessions = asArray(root.sessions, 'sessions').map((value, index) => {
    const session = asRecord(value, `sessions[${index}]`) as unknown as Session
    const sessionRecord = session as unknown as Record<string, unknown>
    assertCausalTimestamp(sessionRecord.startedAt, `sessions[${index}].startedAt`)
    if (sessionRecord.endedAt !== undefined) {
      assertCausalTimestamp(sessionRecord.endedAt, `sessions[${index}].endedAt`)
    }
    if (Array.isArray(sessionRecord.attendanceEvents)) {
      sessionRecord.attendanceEvents.forEach((event, eventIndex) => {
        if (event && typeof event === 'object' && 'at' in event) {
          assertCausalTimestamp(
            (event as Record<string, unknown>).at,
            `sessions[${index}].attendanceEvents[${eventIndex}].at`,
          )
        }
      })
    }
    const liveMatch = normalizeLiveMatch(
      (session as unknown as Record<string, unknown>).liveMatch,
      `活動「${session.name ?? session.id}」的 liveMatch`,
    )
    if (liveMatch && !session.active) throw new Error(`已結束活動「${session.name ?? session.id}」不可有 liveMatch`)
    const cooldown = session.rotationWildcardCooldownRemaining
    if (
      cooldown !== undefined &&
      (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 2)
    ) {
      throw new Error(`活動「${session.name ?? session.id}」的 rotation wildcard cooldown 無效`)
    }
    return {
      ...session,
      rotationWildcardCooldownRemaining: cooldown ?? 0,
      defaultScoringFormat: normalizeFormat(
        (session as unknown as Record<string, unknown>).defaultScoringFormat,
        `活動「${session.name ?? session.id}」`,
      ),
      ...(liveMatch ? { liveMatch } : {}),
    }
  })

  const matches = asArray(root.matches, 'matches').map((value, index) => {
    const match = asRecord(value, `matches[${index}]`) as unknown as Match
    assertCausalTimestamp(match.at, `matches[${index}].at`)
    const scoringFormat = normalizeFormat(
      (match as unknown as Record<string, unknown>).scoringFormat,
      `比賽 ${match.id ?? index}`,
    )
    // 不合賽制的比分只有兩種可能：使用者明確強制記錄（不計入強度），或資料損毀。
    // 靠 excludedFromRating 這個明確旗標區分——沒有旗標就是損毀，整批拒絕。
    const excluded = (match as unknown as Record<string, unknown>).excludedFromRating === true
    if (
      !excluded
      && isStructured(scoringFormat)
      && !isLegalEndpoint(scoringFormat, match.scoreA, match.scoreB)
    ) {
      throw new Error(`比賽 ${match.id ?? index} 的比分 ${match.scoreA}:${match.scoreB} 不符合其記錄的賽制`)
    }
    const normalized: Match = { ...match, scoringFormat }
    if (excluded) normalized.excludedFromRating = true
    else delete normalized.excludedFromRating
    const rotationWildcard = normalizeRotationWildcard(
      (match as unknown as Record<string, unknown>).rotationWildcard,
      { mode: match.mode, teamA: match.teamA, teamB: match.teamB },
      `比賽 ${match.id ?? index}.rotationWildcard`,
    )
    if (rotationWildcard) normalized.rotationWildcard = rotationWildcard
    else delete normalized.rotationWildcard
    return normalized
  })

  for (const session of sessions) {
    const ownMatches = matches.filter((match) => match.sessionId === session.id)
    const hasHighWater = session.nextCompletionSequence !== undefined
    const presentSequenceCount = ownMatches.filter(
      (match) => match.completionSequence !== undefined,
    ).length
    const whollyLegacy = !hasHighWater && presentSequenceCount === 0
    if (whollyLegacy) continue
    try {
      assertValidCompletionChronology(session, ownMatches)
    } catch (error) {
      throw new Error(
        `活動「${session.name ?? session.id}」的 completion sequence 無效：${(error as Error).message}`,
      )
    }
  }

  return {
    players: asArray(root.players, 'players') as AppData['players'],
    sessions: sessions as AppData['sessions'],
    matches: matches as AppData['matches'],
    overrides: asArray(root.overrides, 'overrides') as AppData['overrides'],
    baselines: asArray(root.baselines, 'baselines') as AppData['baselines'],
  }
}

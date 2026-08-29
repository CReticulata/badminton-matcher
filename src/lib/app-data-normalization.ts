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

/** 缺欄位→legacy-missing；有欄位→嚴格重建（失敗即 throw） */
function normalizeFormat(value: unknown, field: string): ScoringFormatSnapshot {
  if (value === undefined || value === null) return createUnknownSnapshot('legacy-missing')
  try {
    return reconstructScoringFormat(value)
  } catch (error) {
    throw new Error(`${field} 的賽制快照無效：${(error as Error).message}`)
  }
}

function normalizeLiveMatch(value: unknown, field: string): MatchContext | undefined {
  if (value === undefined || value === null) return undefined
  const live = asRecord(value, field)
  const mode = live.mode
  const teamA = asArray(live.teamA, `${field}.teamA`)
  const teamB = asArray(live.teamB, `${field}.teamB`)
  const resters = asArray(live.resters, `${field}.resters`)
  const allIds = [...teamA, ...teamB, ...resters]
  if (
    (mode !== 'singles' && mode !== 'doubles')
    || allIds.some((id) => typeof id !== 'string' || !id)
    || typeof live.liveMatchId !== 'string' || !live.liveMatchId
    || !Number.isFinite(live.startedAt)
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
  return {
    mode,
    teamA: teamA as string[], teamB: teamB as string[], resters: resters as string[],
    scoringFormat: normalizeFormat(live.scoringFormat, `${field}.scoringFormat`),
    liveMatchId: live.liveMatchId,
    startedAt: live.startedAt as number,
    fairnessPeriodIds: lineage as Record<string, string> | undefined,
  }
}

export function normalizeAppData(raw: unknown): AppData {
  const root = asRecord(raw, '資料')

  const sessions = asArray(root.sessions, 'sessions').map((value, index) => {
    const session = asRecord(value, `sessions[${index}]`) as unknown as Session
    const liveMatch = normalizeLiveMatch(
      (session as unknown as Record<string, unknown>).liveMatch,
      `活動「${session.name ?? session.id}」的 liveMatch`,
    )
    if (liveMatch && !session.active) throw new Error(`已結束活動「${session.name ?? session.id}」不可有 liveMatch`)
    return {
      ...session,
      defaultScoringFormat: normalizeFormat(
        (session as unknown as Record<string, unknown>).defaultScoringFormat,
        `活動「${session.name ?? session.id}」`,
      ),
      ...(liveMatch ? { liveMatch } : {}),
    }
  })

  const matches = asArray(root.matches, 'matches').map((value, index) => {
    const match = asRecord(value, `matches[${index}]`) as unknown as Match
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
    return normalized
  })

  return {
    players: asArray(root.players, 'players') as AppData['players'],
    sessions: sessions as AppData['sessions'],
    matches: matches as AppData['matches'],
    overrides: asArray(root.overrides, 'overrides') as AppData['overrides'],
    baselines: asArray(root.baselines, 'baselines') as AppData['baselines'],
  }
}

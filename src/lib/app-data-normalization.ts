/**
 * 把未信任的 localStorage／CSV 內容正規化成 AppData。
 *
 * 缺少賽制欄位＝舊資料，補成 legacy-missing；已宣告但格式錯誤或與比分矛盾＝壞資料，
 * 整批拒絕。兩者不可混為一談：把壞資料降級成「未知」會讓損毀看起來像正常的舊紀錄。
 */
import type { AppData, Match, ScoringFormatSnapshot, Session } from '../types'
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

export function normalizeAppData(raw: unknown): AppData {
  const root = asRecord(raw, '資料')

  const sessions = asArray(root.sessions, 'sessions').map((value, index) => {
    const session = asRecord(value, `sessions[${index}]`) as unknown as Session
    return {
      ...session,
      defaultScoringFormat: normalizeFormat(
        (session as unknown as Record<string, unknown>).defaultScoringFormat,
        `活動「${session.name ?? session.id}」`,
      ),
    }
  })

  const matches = asArray(root.matches, 'matches').map((value, index) => {
    const match = asRecord(value, `matches[${index}]`) as unknown as Match
    const scoringFormat = normalizeFormat(
      (match as unknown as Record<string, unknown>).scoringFormat,
      `比賽 ${match.id ?? index}`,
    )
    // 已宣告結構化賽制卻存著該賽制下不可能出現的比分＝資料損毀，不降級為未知
    if (isStructured(scoringFormat) && !isLegalEndpoint(scoringFormat, match.scoreA, match.scoreB)) {
      throw new Error(`比賽 ${match.id ?? index} 的比分 ${match.scoreA}:${match.scoreB} 不符合其記錄的賽制`)
    }
    return { ...match, scoringFormat }
  })

  return {
    players: asArray(root.players, 'players') as AppData['players'],
    sessions: sessions as AppData['sessions'],
    matches: matches as AppData['matches'],
    overrides: asArray(root.overrides, 'overrides') as AppData['overrides'],
    baselines: asArray(root.baselines, 'baselines') as AppData['baselines'],
  }
}

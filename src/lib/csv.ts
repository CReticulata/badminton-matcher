/**
 * 單一 CSV 檔匯出/匯入（覆蓋還原語意，換手機/備份用）。
 * 檔內以 [players] / [overrides] / [baselines] / [sessions] / [matches] / [attendance] 區段分隔。
 * 陣列欄位以 "|" 連接。
 */
import type { AppData, AttendanceEvent, Match, MatchContext, Mode, Player, RatingBaseline, RatingOverride, Session } from '../types'
import { createUnknownSnapshot, decodeScoringFormat, encodeScoringFormat } from './scoring-format'

/** 匯入上限：對應瀏覽器 localStorage 實際放得下的量級 */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const IMPORT_MAX_RECORDS = 50_000
export const IMPORT_MAX_FIELD_BYTES = 64 * 1024

function esc(v: string | number | boolean): string {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 解析一列 CSV（支援雙引號跳脫） */
function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** 引號感知的分列：引號內的換行屬於欄位內容，不切列 */
function splitRecords(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      cur += ch
      if (inQ && text[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
    } else if (!inQ && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur !== '') out.push(cur)
  return out
}

const joinIds = (ids: readonly string[]) => ids.join('|')
const splitIds = (s: string) => (s === '' ? [] : s.split('|'))

const PLAYER_HEADER = ['id', 'name', 'color', 'rating', 'rd', 'vol', 'initialRating', 'createdAt', 'archivedAt']
const OVERRIDE_HEADER = ['id', 'playerId', 'rating', 'at']
const BASELINE_HEADER = ['id', 'playerId', 'rating', 'rd', 'vol', 'at']
const SESSION_HEADER = [
  'id', 'name', 'startedAt', 'endedAt', 'presentIds', 'leftIds', 'volunteerRest', 'active',
  'participantIds', 'participantOrderReliable', 'addedDuringSessionIds', 'openingRatings',
  'defaultScoringFormat', 'liveMatch',
]
const MATCH_HEADER = [
  'id', 'sessionId', 'at', 'mode', 'teamA', 'teamB', 'scoreA', 'scoreB', 'resters',
  'scoringFormat', 'excludedFromRating', 'fairnessPeriodIds',
]

const ATTENDANCE_HEADER = ['id', 'sessionId', 'kind', 'playerId', 'at', 'sequence', 'liveMatchId', 'presentIds', 'volunteerRestIds']
const KNOWN_SECTIONS = ['players', 'overrides', 'baselines', 'sessions', 'matches', 'attendance'] as const

export function exportCsv(data: AppData): string {
  const lines: string[] = []
  lines.push('[players]', PLAYER_HEADER.join(','))
  for (const p of data.players) {
    lines.push(
      [p.id, p.name, p.color, p.rating, p.rd, p.vol, p.initialRating, p.createdAt, p.archivedAt ?? ''].map(esc).join(','),
    )
  }
  lines.push('[overrides]', OVERRIDE_HEADER.join(','))
  for (const o of data.overrides) {
    lines.push([o.id, o.playerId, o.rating, o.at].map(esc).join(','))
  }
  lines.push('[baselines]', BASELINE_HEADER.join(','))
  for (const b of data.baselines) {
    lines.push([b.id, b.playerId, b.rating, b.rd, b.vol, b.at].map(esc).join(','))
  }
  lines.push('[sessions]', SESSION_HEADER.join(','))
  for (const s of data.sessions) {
    lines.push(
      [
        s.id, s.name, s.startedAt, s.endedAt ?? '', joinIds(s.presentIds),
        joinIds(s.leftIds), joinIds(s.volunteerRest), s.active,
        joinIds(s.participantIds ?? []), s.participantOrderReliable ?? '',
        joinIds(s.addedDuringSessionIds ?? []), s.openingRatings ? JSON.stringify(s.openingRatings) : '',
        encodeScoringFormat(s.defaultScoringFormat), s.liveMatch ? JSON.stringify(s.liveMatch) : '',
      ]
        .map(esc)
        .join(','),
    )
  }
  lines.push('[matches]', MATCH_HEADER.join(','))
  for (const m of data.matches) {
    lines.push(
      [
        m.id, m.sessionId, m.at, m.mode, joinIds(m.teamA), joinIds(m.teamB),
        m.scoreA, m.scoreB, joinIds(m.resters), encodeScoringFormat(m.scoringFormat),
        m.excludedFromRating === true ? 'true' : '',
        m.fairnessPeriodIds ? JSON.stringify(m.fairnessPeriodIds) : '',
      ]
        .map(esc)
        .join(','),
    )
  }
  lines.push('[attendance]', ATTENDANCE_HEADER.join(','))
  for (const event of data.sessions.flatMap((session) => session.attendanceEvents ?? []).sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.at - b.at || a.sequence - b.sequence)) {
    lines.push([event.id, event.sessionId, event.kind, event.playerId ?? '', event.at, event.sequence, event.liveMatchId ?? '', joinIds(event.presentIds ?? []), joinIds(event.volunteerRestIds ?? [])].map(esc).join(','))
  }
  return lines.join('\n') + '\n'
}

/** 欄位不存在＝舊備份，補 legacy-missing；有值但解不開＝損毀，整批拒絕 */
function decodeFormatCell(cell: string | undefined, where: string) {
  if (cell === undefined || cell === '') return createUnknownSnapshot('legacy-missing')
  try {
    return decodeScoringFormat(cell)
  } catch (error) {
    throw new Error(`${where} 的賽制欄位無效：${(error as Error).message}`)
  }
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

/** 在解析任何列之前先擋掉超量檔案，避免耗盡瀏覽器記憶體或寫入半套資料 */
function assertImportBudget(text: string) {
  if (utf8Bytes(text) > IMPORT_MAX_BYTES) {
    throw new Error(`CSV 超過 ${IMPORT_MAX_BYTES / 1024 / 1024} MiB 上限`)
  }
  let records = 0
  for (const raw of splitRecords(text)) {
    if (++records > IMPORT_MAX_RECORDS) throw new Error(`CSV 超過 ${IMPORT_MAX_RECORDS} 列上限`)
    for (const cell of parseLine(raw)) {
      if (utf8Bytes(cell) > IMPORT_MAX_FIELD_BYTES) {
        throw new Error(`CSV 有欄位超過 ${IMPORT_MAX_FIELD_BYTES / 1024} KiB 上限`)
      }
    }
  }
}

/** 解析匯入的 CSV；格式錯誤時 throw Error（訊息為繁中） */
export function importCsv(text: string): AppData {
  assertImportBudget(text)
  const data: AppData = { players: [], sessions: [], matches: [], overrides: [], baselines: [] }
  const attendance: AttendanceEvent[] = []
  const seenSections = new Set<string>()
  let section: string | null = null
  let header: string[] | null = null

  const num = (s: string | undefined, field: string): number => {
    const n = Number(s)
    if (s === undefined || s === '' || !Number.isFinite(n)) {
      throw new Error(`欄位 ${field} 不是有效數字：「${s ?? ''}」`)
    }
    return n
  }
  const optionalNum = (s: string | undefined, field: string): number | undefined =>
    s == null || s === '' ? undefined : num(s, field)

  for (const raw of splitRecords(text)) {
    const line = raw.trim() === '' ? '' : raw
    if (line === '') continue
    const secMatch = /^\[(\w+)\]$/.exec(line.trim())
    if (secMatch) {
      section = secMatch[1]!
      if (seenSections.has(section)) throw new Error(`CSV 區段重複：[${section}]`)
      seenSections.add(section)
      header = null
      continue
    }
    if (!section) throw new Error('CSV 格式錯誤：缺少區段標頭（如 [players]）')
    const cells = parseLine(line)
    if (!header) {
      header = cells.map((c) => c.trim())
      if ((KNOWN_SECTIONS as readonly string[]).includes(section)) {
        const dup = header.find((h, i) => header!.indexOf(h) !== i)
        if (dup !== undefined) throw new Error(`[${section}] 區段的欄位名稱重複：${dup}`)
      }
      continue
    }
    // 已知區段的資料列寬度必須與標頭一致；多欄或缺欄屬損毀，不是舊資料
    if ((KNOWN_SECTIONS as readonly string[]).includes(section) && cells.length !== header.length) {
      throw new Error(`[${section}] 區段有一列的欄位數（${cells.length}）與標頭（${header.length}）不符`)
    }
    const row: Record<string, string> = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))

    if (section === 'players') {
      const p: Player = {
        id: row.id ?? '',
        name: row.name ?? '',
        color: row.color ?? '#888888',
        rating: num(row.rating, 'rating'),
        rd: num(row.rd, 'rd'),
        vol: num(row.vol, 'vol'),
        initialRating: num(row.initialRating, 'initialRating'),
        createdAt: num(row.createdAt, 'createdAt'),
      }
      const archivedAt = optionalNum(row.archivedAt, 'archivedAt')
      if (archivedAt !== undefined) p.archivedAt = archivedAt
      if (!p.id || !p.name) throw new Error('players 區段缺少 id 或 name')
      data.players.push(p)
    } else if (section === 'overrides') {
      const o: RatingOverride = {
        id: row.id ?? '',
        playerId: row.playerId ?? '',
        rating: num(row.rating, 'rating'),
        at: num(row.at, 'at'),
      }
      data.overrides.push(o)
    } else if (section === 'baselines') {
      const b: RatingBaseline = {
        id: row.id ?? '',
        playerId: row.playerId ?? '',
        rating: num(row.rating, 'rating'),
        rd: num(row.rd, 'rd'),
        vol: num(row.vol, 'vol'),
        at: num(row.at, 'at'),
      }
      data.baselines.push(b)
    } else if (section === 'sessions') {
      const s: Session = {
        id: row.id ?? '',
        name: row.name ?? '',
        startedAt: num(row.startedAt, 'startedAt'),
        presentIds: splitIds(row.presentIds ?? ''),
        leftIds: splitIds(row.leftIds ?? ''),
        volunteerRest: splitIds(row.volunteerRest ?? ''),
        active: row.active === 'true',
        defaultScoringFormat: decodeFormatCell(row.defaultScoringFormat, `活動「${row.name ?? ''}」`),
      }
      const endedAt = optionalNum(row.endedAt, 'endedAt')
      if (endedAt !== undefined) s.endedAt = endedAt
      if (row.participantIds !== undefined) s.participantIds = splitIds(row.participantIds)
      if (row.participantOrderReliable !== undefined && row.participantOrderReliable !== '') {
        s.participantOrderReliable = row.participantOrderReliable === 'true'
      }
      if (row.addedDuringSessionIds !== undefined) {
        s.addedDuringSessionIds = splitIds(row.addedDuringSessionIds)
      }
      if (row.openingRatings) {
        try {
          const parsed = JSON.parse(row.openingRatings) as Record<string, { rating: number; rd: number; vol: number }>
          if (
            !parsed ||
            typeof parsed !== 'object' ||
            Object.values(parsed).some(
              (state) => !state || !Number.isFinite(state.rating) || !Number.isFinite(state.rd) || !Number.isFinite(state.vol),
            )
          ) throw new Error('invalid snapshot')
          s.openingRatings = parsed
        } catch {
          throw new Error('欄位 openingRatings 不是有效的活動開場狀態')
        }
      }
      if (row.liveMatch) {
        try {
          const parsed = JSON.parse(row.liveMatch) as Partial<MatchContext>
          const teamA = parsed.teamA
          const teamB = parsed.teamB
          const resters = parsed.resters
          const rawLineage = parsed.fairnessPeriodIds
          if (rawLineage !== undefined && (!rawLineage || typeof rawLineage !== 'object' || Array.isArray(rawLineage))) {
            throw new Error('invalid live lineage')
          }
          const lineage = rawLineage as Record<string, unknown> | undefined
          if (
            (parsed.mode !== 'singles' && parsed.mode !== 'doubles')
            || !Array.isArray(teamA) || !Array.isArray(teamB) || !Array.isArray(resters)
            || [...teamA, ...teamB, ...resters].some((id) => typeof id !== 'string' || !id)
            || new Set([...teamA, ...teamB]).size !== teamA.length + teamB.length
            || typeof parsed.liveMatchId !== 'string' || !parsed.liveMatchId
            || !Number.isFinite(parsed.startedAt)
            || !parsed.scoringFormat
            || (lineage !== undefined && (
              Object.keys(lineage).length !== teamA.length + teamB.length
              || [...teamA, ...teamB].some((playerId) => typeof lineage[playerId] !== 'string' || !lineage[playerId])
            ))
          ) throw new Error('invalid live match')
          s.liveMatch = {
            mode: parsed.mode,
            teamA: [...teamA], teamB: [...teamB], resters: [...resters],
            scoringFormat: decodeScoringFormat(JSON.stringify(parsed.scoringFormat)),
            liveMatchId: parsed.liveMatchId,
            startedAt: parsed.startedAt,
            fairnessPeriodIds: lineage as Record<string, string> | undefined,
          }
        } catch {
          throw new Error(`活動「${s.name}」的 liveMatch 無效`)
        }
      }
      data.sessions.push(s)
    } else if (section === 'matches') {
      const mode = row.mode === 'singles' ? 'singles' : ('doubles' as Mode)
      const m: Match = {
        id: row.id ?? '',
        sessionId: row.sessionId ?? '',
        at: num(row.at, 'at'),
        mode,
        teamA: splitIds(row.teamA ?? ''),
        teamB: splitIds(row.teamB ?? ''),
        scoreA: num(row.scoreA, 'scoreA'),
        scoreB: num(row.scoreB, 'scoreB'),
        resters: splitIds(row.resters ?? ''),
        scoringFormat: decodeFormatCell(row.scoringFormat, `比賽 ${row.id ?? ''}`),
      }
      if (row.excludedFromRating === 'true') m.excludedFromRating = true
      if (row.fairnessPeriodIds) {
        try {
          const lineage = JSON.parse(row.fairnessPeriodIds) as unknown
          if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage) || Object.entries(lineage).some(([playerId, periodId]) => !playerId || typeof periodId !== 'string' || !periodId)) throw new Error('invalid lineage')
          m.fairnessPeriodIds = lineage as Record<string, string>
        } catch {
          throw new Error(`比賽 ${m.id} 的 fairnessPeriodIds 無效`)
        }
      }
      data.matches.push(m)
    } else if (section === 'attendance') {
      const kinds = new Set(['join', 'leave', 'voluntary-rest-start', 'voluntary-rest-end', 'fairness-reset-requested', 'fairness-period-started', 'fairness-recovery-boundary'])
      if (!kinds.has(row.kind ?? '')) throw new Error(`未知 attendance 事件種類：${row.kind ?? ''}`)
      const sequence = num(row.sequence, 'attendance.sequence')
      if (!Number.isInteger(sequence)) throw new Error('attendance.sequence 必須是整數')
      attendance.push({ id: row.id ?? '', sessionId: row.sessionId ?? '', kind: row.kind as AttendanceEvent['kind'], playerId: row.playerId || undefined, at: num(row.at, 'attendance.at'), sequence, liveMatchId: row.liveMatchId || undefined, presentIds: splitIds(row.presentIds ?? ''), volunteerRestIds: splitIds(row.volunteerRestIds ?? '') })
    }
    // 未知區段：略過（向前相容）
  }
  if (data.players.length === 0 && data.matches.length === 0) {
    throw new Error('CSV 內容為空或無法辨識')
  }
  const sessionsById = new Map(data.sessions.map((session) => [session.id, session]))
  const playersById = new Set(data.players.map((player) => player.id))
  const eventIds = new Set<string>()
  const periodSessionById = new Map<string, string>()
  for (const event of attendance) {
    const session = sessionsById.get(event.sessionId)
    if (!session) throw new Error(`attendance 事件參照未知活動：${event.sessionId}`)
    if (!event.id || eventIds.has(event.id)) throw new Error(`attendance 事件 ID 重複或缺少：${event.id}`)
    eventIds.add(event.id)
    if (event.kind === 'fairness-period-started') periodSessionById.set(event.id, event.sessionId)
    if (event.playerId && !playersById.has(event.playerId)) throw new Error(`attendance 事件參照未知球員：${event.playerId}`)
    if (event.kind !== 'fairness-recovery-boundary' && !event.playerId) throw new Error(`attendance 事件缺少球員：${event.kind}`)
    if (event.kind === 'fairness-recovery-boundary' && [...(event.presentIds ?? []), ...(event.volunteerRestIds ?? [])].some((id) => !playersById.has(id))) throw new Error('recovery boundary 參照未知球員')
    ;(session.attendanceEvents ??= []).push(event)
  }
  for (const session of data.sessions) {
    const live = session.liveMatch
    if (!live) continue
    if (!session.active) throw new Error(`已結束活動 ${session.id} 不可有 liveMatch`)
    const lineup = [...live.teamA, ...live.teamB]
    if (lineup.some((id) => !playersById.has(id) || !session.presentIds.includes(id))) {
      throw new Error(`活動 ${session.id} 的 liveMatch 參照未知或不在場球員`)
    }
    for (const [playerId, periodId] of Object.entries(live.fairnessPeriodIds ?? {})) {
      if (!lineup.includes(playerId) || periodSessionById.get(periodId) !== session.id) throw new Error(`活動 ${session.id} 的 liveMatch fairness lineage 無效`)
    }
  }
  for (const match of data.matches) {
    // 舊版 CSV 允許只有 players + matches、沒有 sessions 區段；這類資料沒有
    // fairness lineage，仍交由既有 migration/normalization 相容處理。只要 CSV
    // 已帶活動資料或新的 lineage，就必須嚴格驗證活動參照。
    if ((sessionsById.size > 0 || match.fairnessPeriodIds) && !sessionsById.has(match.sessionId)) {
      throw new Error(`比賽參照未知活動：${match.sessionId}`)
    }
    const lineupIds = [...match.teamA, ...match.teamB]
    const lineup = new Set(lineupIds)
    if (match.fairnessPeriodIds && lineup.size !== lineupIds.length) throw new Error(`比賽 ${match.id} 的球員重複`)
    if ([...lineup].some((id) => !playersById.has(id))) throw new Error(`比賽 ${match.id} 參照未知球員`)
    const lineage = match.fairnessPeriodIds
    if (lineage && (Object.keys(lineage).length !== lineup.size || [...lineup].some((playerId) => !lineage[playerId]))) {
      throw new Error(`比賽 ${match.id} 的 fairness lineage 不完整`)
    }
    for (const [playerId, periodId] of Object.entries(lineage ?? {})) {
      if (!lineup.has(playerId) || periodSessionById.get(periodId) !== match.sessionId) throw new Error(`比賽 ${match.id} 的 fairness lineage 參照無效`)
    }
  }
  for (const session of data.sessions) {
    const sequences = new Set<number>()
    for (const event of session.attendanceEvents ?? []) {
      if (!event.id || sequences.has(event.sequence)) throw new Error(`活動 ${session.id} 的 attendance sequence 重複或缺少 id`)
      sequences.add(event.sequence)
    }
  }
  return data
}

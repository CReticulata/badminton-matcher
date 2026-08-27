/**
 * 單一 CSV 檔匯出/匯入（覆蓋還原語意，換手機/備份用）。
 * 檔內以 [players] / [overrides] / [baselines] / [sessions] / [matches] 區段分隔。
 * 陣列欄位以 "|" 連接。
 */
import type { AppData, Match, Mode, Player, RatingBaseline, RatingOverride, Session } from '../types'
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
  'defaultScoringFormat',
]
const MATCH_HEADER = [
  'id', 'sessionId', 'at', 'mode', 'teamA', 'teamB', 'scoreA', 'scoreB', 'resters',
  'scoringFormat', 'excludedFromRating',
]

const KNOWN_SECTIONS = ['players', 'overrides', 'baselines', 'sessions', 'matches'] as const

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
        encodeScoringFormat(s.defaultScoringFormat),
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
      ]
        .map(esc)
        .join(','),
    )
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
      data.matches.push(m)
    }
    // 未知區段：略過（向前相容）
  }
  if (data.players.length === 0 && data.matches.length === 0) {
    throw new Error('CSV 內容為空或無法辨識')
  }
  return data
}

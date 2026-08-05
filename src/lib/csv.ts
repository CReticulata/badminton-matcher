/**
 * 單一 CSV 檔匯出/匯入（覆蓋還原語意，換手機/備份用）。
 * 檔內以 [players] / [overrides] / [sessions] / [matches] 區段分隔。
 * 陣列欄位以 "|" 連接。
 */
import type { AppData, Match, Mode, Player, RatingOverride, Session } from '../types'

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

const PLAYER_HEADER = ['id', 'name', 'color', 'rating', 'rd', 'vol', 'initialRating', 'createdAt']
const OVERRIDE_HEADER = ['id', 'playerId', 'rating', 'at']
const SESSION_HEADER = ['id', 'name', 'startedAt', 'presentIds', 'leftIds', 'volunteerRest', 'active']
const MATCH_HEADER = ['id', 'sessionId', 'at', 'mode', 'teamA', 'teamB', 'scoreA', 'scoreB', 'resters']

export function exportCsv(data: AppData): string {
  const lines: string[] = []
  lines.push('[players]', PLAYER_HEADER.join(','))
  for (const p of data.players) {
    lines.push(
      [p.id, p.name, p.color, p.rating, p.rd, p.vol, p.initialRating, p.createdAt].map(esc).join(','),
    )
  }
  lines.push('[overrides]', OVERRIDE_HEADER.join(','))
  for (const o of data.overrides) {
    lines.push([o.id, o.playerId, o.rating, o.at].map(esc).join(','))
  }
  lines.push('[sessions]', SESSION_HEADER.join(','))
  for (const s of data.sessions) {
    lines.push(
      [s.id, s.name, s.startedAt, joinIds(s.presentIds), joinIds(s.leftIds), joinIds(s.volunteerRest), s.active]
        .map(esc)
        .join(','),
    )
  }
  lines.push('[matches]', MATCH_HEADER.join(','))
  for (const m of data.matches) {
    lines.push(
      [m.id, m.sessionId, m.at, m.mode, joinIds(m.teamA), joinIds(m.teamB), m.scoreA, m.scoreB, joinIds(m.resters)]
        .map(esc)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

/** 解析匯入的 CSV；格式錯誤時 throw Error（訊息為繁中） */
export function importCsv(text: string): AppData {
  const data: AppData = { players: [], sessions: [], matches: [], overrides: [] }
  let section: string | null = null
  let header: string[] | null = null

  const num = (s: string | undefined, field: string): number => {
    const n = Number(s)
    if (s === undefined || s === '' || !Number.isFinite(n)) {
      throw new Error(`欄位 ${field} 不是有效數字：「${s ?? ''}」`)
    }
    return n
  }

  for (const raw of splitRecords(text)) {
    const line = raw.trim() === '' ? '' : raw
    if (line === '') continue
    const secMatch = /^\[(\w+)\]$/.exec(line.trim())
    if (secMatch) {
      section = secMatch[1]!
      header = null
      continue
    }
    if (!section) throw new Error('CSV 格式錯誤：缺少區段標頭（如 [players]）')
    const cells = parseLine(line)
    if (!header) {
      header = cells.map((c) => c.trim())
      continue
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
    } else if (section === 'sessions') {
      const s: Session = {
        id: row.id ?? '',
        name: row.name ?? '',
        startedAt: num(row.startedAt, 'startedAt'),
        presentIds: splitIds(row.presentIds ?? ''),
        leftIds: splitIds(row.leftIds ?? ''),
        volunteerRest: splitIds(row.volunteerRest ?? ''),
        active: row.active === 'true',
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
      }
      data.matches.push(m)
    }
    // 未知區段：略過（向前相容）
  }
  if (data.players.length === 0 && data.matches.length === 0) {
    throw new Error('CSV 內容為空或無法辨識')
  }
  return data
}

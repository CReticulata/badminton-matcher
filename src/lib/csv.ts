/** One CSV backup with strict, additive scoring-format columns. */
import type { AppData, Mode, Player, RatingBaseline, RatingOverride } from '../types'
import { normalizeAppData } from './app-data-normalization'
import { encodeScoringFormat, reconstructScoringFormat } from './scoring-format'

const MAX_UTF8_BYTES = 5 * 1024 * 1024
const MAX_RECORDS = 50_000
const MAX_FIELD_BYTES = 64 * 1024
const encoder = new TextEncoder()

const PLAYER_HEADER = ['id', 'name', 'color', 'rating', 'rd', 'vol', 'initialRating', 'createdAt']
const OVERRIDE_HEADER = ['id', 'playerId', 'rating', 'at']
const BASELINE_HEADER = ['id', 'playerId', 'rating', 'rd', 'vol', 'at']
const LEGACY_SESSION_HEADER = ['id', 'name', 'startedAt', 'presentIds', 'leftIds', 'volunteerRest', 'active']
const SESSION_HEADER = [...LEGACY_SESSION_HEADER, 'defaultScoringFormat']
const LEGACY_MATCH_HEADER = ['id', 'sessionId', 'at', 'mode', 'teamA', 'teamB', 'scoreA', 'scoreB', 'resters']
const MATCH_HEADER = [...LEGACY_MATCH_HEADER, 'scoringFormat']
const KNOWN_HEADERS: Record<string, readonly string[][]> = {
  players: [PLAYER_HEADER], overrides: [OVERRIDE_HEADER], baselines: [BASELINE_HEADER],
  sessions: [LEGACY_SESSION_HEADER, SESSION_HEADER], matches: [LEGACY_MATCH_HEADER, MATCH_HEADER],
}

function esc(value: string | number | boolean): string {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function checkedField(value: string): string {
  if (encoder.encode(value).byteLength > MAX_FIELD_BYTES) throw new Error('CSV 欄位超過 64 KiB 限制')
  return value
}

/** Parses a logical record and rejects unquoted quotes and over-budget decoded fields. */
function parseLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  let atFieldStart = true
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { current += '"'; index++ } else quoted = false
      } else current += char
    } else if (char === ',') {
      out.push(checkedField(current)); current = ''; atFieldStart = true
    } else if (char === '"' && atFieldStart) {
      quoted = true; atFieldStart = false
    } else {
      if (char === '"') throw new Error('CSV 引號格式錯誤')
      current += char; atFieldStart = false
    }
  }
  if (quoted) throw new Error('CSV 引號未關閉')
  out.push(checkedField(current))
  return out
}

/** Split quote-aware records while rejecting text/record budget overflow. */
function splitRecords(text: string): string[] {
  if (encoder.encode(text).byteLength > MAX_UTF8_BYTES) throw new Error('CSV 超過 5 MiB 限制')
  const records: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (char === '"') {
      current += char
      if (quoted && text[index + 1] === '"') { current += '"'; index++ } else quoted = !quoted
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++
      if (current !== '') {
        records.push(current)
        if (records.length > MAX_RECORDS) throw new Error('CSV 超過 50,000 筆紀錄限制')
      }
      current = ''
    } else current += char
  }
  if (quoted) throw new Error('CSV 引號未關閉')
  if (current !== '') {
    records.push(current)
    if (records.length > MAX_RECORDS) throw new Error('CSV 超過 50,000 筆紀錄限制')
  }
  return records
}

const joinIds = (ids: readonly string[]) => ids.join('|')
const splitIds = (text: string) => (text === '' ? [] : text.split('|'))
const sameHeader = (actual: readonly string[], expected: readonly string[]) => actual.length === expected.length && actual.every((cell, index) => cell === expected[index])

export function exportCsv(data: AppData): string {
  const lines: string[] = []
  lines.push('[players]', PLAYER_HEADER.join(','))
  for (const player of data.players) lines.push([player.id, player.name, player.color, player.rating, player.rd, player.vol, player.initialRating, player.createdAt].map(esc).join(','))
  lines.push('[overrides]', OVERRIDE_HEADER.join(','))
  for (const override of data.overrides) lines.push([override.id, override.playerId, override.rating, override.at].map(esc).join(','))
  lines.push('[baselines]', BASELINE_HEADER.join(','))
  for (const baseline of data.baselines) lines.push([baseline.id, baseline.playerId, baseline.rating, baseline.rd, baseline.vol, baseline.at].map(esc).join(','))
  lines.push('[sessions]', SESSION_HEADER.join(','))
  for (const session of data.sessions) lines.push([session.id, session.name, session.startedAt, joinIds(session.presentIds), joinIds(session.leftIds), joinIds(session.volunteerRest), session.active, encodeScoringFormat(session.defaultScoringFormat)].map(esc).join(','))
  lines.push('[matches]', MATCH_HEADER.join(','))
  for (const match of data.matches) lines.push([match.id, match.sessionId, match.at, match.mode, joinIds(match.teamA), joinIds(match.teamB), match.scoreA, match.scoreB, joinIds(match.resters), encodeScoringFormat(match.scoringFormat)].map(esc).join(','))
  return lines.join('\n') + '\n'
}

function requiredNumber(value: string | undefined, field: string): number {
  const number = Number(value)
  if (value === undefined || value === '' || !Number.isFinite(number)) throw new Error(`欄位 ${field} 不是有效數字：「${value ?? ''}」`)
  return number
}

/** Parses into plain values then normalizes the complete candidate atomically. */
export function importCsv(text: string): AppData {
  const candidate: Omit<AppData, 'sessions' | 'matches'> & { sessions: unknown[]; matches: unknown[] } = { players: [], sessions: [], matches: [], overrides: [], baselines: [] }
  const knownSections = new Set<string>()
  let section: string | null = null
  let header: string[] | null = null

  for (const raw of splitRecords(text)) {
    const line = raw.trim() === '' ? '' : raw
    if (line === '') continue
    const sectionMatch = /^\[(\w+)\]$/.exec(line.trim())
    if (sectionMatch) {
      section = sectionMatch[1]!
      if (Object.hasOwn(KNOWN_HEADERS, section)) {
        if (knownSections.has(section)) throw new Error(`CSV 重複區段：${section}`)
        knownSections.add(section)
      }
      header = null
      continue
    }
    if (!section) throw new Error('CSV 格式錯誤：缺少區段標頭（如 [players]）')
    const cells = parseLine(line)
    if (!header) {
      header = cells.map((cell) => cell.trim())
      if (new Set(header).size !== header.length) throw new Error('CSV 標頭重複')
      const permitted = KNOWN_HEADERS[section]
      if (permitted && !permitted.some((expected) => sameHeader(header!, expected))) throw new Error(`CSV ${section} 標頭不正確`)
      continue
    }
    if (Object.hasOwn(KNOWN_HEADERS, section) && cells.length !== header.length) throw new Error(`CSV ${section} 列欄位數不正確`)
    if (!Object.hasOwn(KNOWN_HEADERS, section)) continue
    const row = Object.fromEntries(header.map((name, index) => [name, cells[index]!])) as Record<string, string>
    if (section === 'players') {
      const player: Player = { id: row.id, name: row.name, color: row.color, rating: requiredNumber(row.rating, 'rating'), rd: requiredNumber(row.rd, 'rd'), vol: requiredNumber(row.vol, 'vol'), initialRating: requiredNumber(row.initialRating, 'initialRating'), createdAt: requiredNumber(row.createdAt, 'createdAt') }
      if (!player.id || !player.name) throw new Error('players 區段缺少 id 或 name')
      candidate.players.push(player)
    } else if (section === 'overrides') {
      candidate.overrides.push({ id: row.id, playerId: row.playerId, rating: requiredNumber(row.rating, 'rating'), at: requiredNumber(row.at, 'at') } as RatingOverride)
    } else if (section === 'baselines') {
      candidate.baselines.push({ id: row.id, playerId: row.playerId, rating: requiredNumber(row.rating, 'rating'), rd: requiredNumber(row.rd, 'rd'), vol: requiredNumber(row.vol, 'vol'), at: requiredNumber(row.at, 'at') } as RatingBaseline)
    } else if (section === 'sessions') {
      const session: Record<string, unknown> = { id: row.id, name: row.name, startedAt: requiredNumber(row.startedAt, 'startedAt'), presentIds: splitIds(row.presentIds), leftIds: splitIds(row.leftIds), volunteerRest: splitIds(row.volunteerRest), active: row.active === 'true' }
      if (Object.hasOwn(row, 'defaultScoringFormat')) {
        if (row.defaultScoringFormat === '') throw new Error('defaultScoringFormat 不可為空')
        session.defaultScoringFormat = reconstructScoringFormat(JSON.parse(row.defaultScoringFormat))
      }
      candidate.sessions.push(session)
    } else if (section === 'matches') {
      const match: Record<string, unknown> = { id: row.id, sessionId: row.sessionId, at: requiredNumber(row.at, 'at'), mode: row.mode === 'singles' ? 'singles' : ('doubles' as Mode), teamA: splitIds(row.teamA), teamB: splitIds(row.teamB), scoreA: requiredNumber(row.scoreA, 'scoreA'), scoreB: requiredNumber(row.scoreB, 'scoreB'), resters: splitIds(row.resters) }
      if (Object.hasOwn(row, 'scoringFormat')) {
        if (row.scoringFormat === '') throw new Error('scoringFormat 不可為空')
        match.scoringFormat = reconstructScoringFormat(JSON.parse(row.scoringFormat))
      }
      candidate.matches.push(match)
    }
  }
  if (candidate.players.length === 0 && candidate.matches.length === 0) throw new Error('CSV 內容為空或無法辨識')
  return normalizeAppData(candidate)
}

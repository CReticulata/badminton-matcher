import type { AppData, Match, Player, RatingBaseline, RatingOverride, Session } from '../types'
import { createUnknownSnapshot, isLegalEndpoint, reconstructScoringFormat } from './scoring-format'

type UnknownRecord = Record<string, unknown>

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}`)
  return value
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`)
  return value as UnknownRecord
}

function requireExactKeys(record: UnknownRecord, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional])
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Invalid persisted fields')
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${name}`)
  return value
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${name}`)
  return value
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${name}`)
  return value
}

function requireStringArray(value: unknown, name: string): string[] {
  return requireArray(value, name).map((item) => requireString(item, name))
}

function normalizePlayer(value: unknown): Player {
  const record = requireRecord(value, 'player')
  requireExactKeys(record, ['id', 'name', 'color', 'rating', 'rd', 'vol', 'initialRating', 'createdAt'])
  return {
    id: requireString(record.id, 'player id'),
    name: requireString(record.name, 'player name'),
    color: requireString(record.color, 'player color'),
    rating: requireFiniteNumber(record.rating, 'player rating'),
    rd: requireFiniteNumber(record.rd, 'player rd'),
    vol: requireFiniteNumber(record.vol, 'player vol'),
    initialRating: requireFiniteNumber(record.initialRating, 'player initial rating'),
    createdAt: requireFiniteNumber(record.createdAt, 'player createdAt'),
  }
}

function normalizeSession(value: unknown): Session {
  const record = requireRecord(value, 'session')
  requireExactKeys(record, ['id', 'name', 'startedAt', 'presentIds', 'leftIds', 'volunteerRest', 'active'], ['defaultScoringFormat'])
  const defaultScoringFormat = Object.hasOwn(record, 'defaultScoringFormat')
    ? reconstructScoringFormat(record.defaultScoringFormat)
    : createUnknownSnapshot('legacy-missing')
  return {
    id: requireString(record.id, 'session id'),
    name: requireString(record.name, 'session name'),
    startedAt: requireFiniteNumber(record.startedAt, 'session startedAt'),
    presentIds: requireStringArray(record.presentIds, 'session presentIds'),
    leftIds: requireStringArray(record.leftIds, 'session leftIds'),
    volunteerRest: requireStringArray(record.volunteerRest, 'session volunteerRest'),
    active: requireBoolean(record.active, 'session active'),
    defaultScoringFormat,
  }
}

function normalizeMatch(value: unknown): Match {
  const record = requireRecord(value, 'match')
  requireExactKeys(record, ['id', 'sessionId', 'at', 'mode', 'teamA', 'teamB', 'scoreA', 'scoreB', 'resters'], ['scoringFormat'])
  const scoringFormat = Object.hasOwn(record, 'scoringFormat')
    ? reconstructScoringFormat(record.scoringFormat)
    : createUnknownSnapshot('legacy-missing')
  const scoreA = requireFiniteNumber(record.scoreA, 'match scoreA')
  const scoreB = requireFiniteNumber(record.scoreB, 'match scoreB')
  if (!isLegalEndpoint(scoringFormat, scoreA, scoreB)) throw new Error('Invalid match endpoint')
  if (record.mode !== 'doubles' && record.mode !== 'singles') throw new Error('Invalid match mode')
  return {
    id: requireString(record.id, 'match id'),
    sessionId: requireString(record.sessionId, 'match sessionId'),
    at: requireFiniteNumber(record.at, 'match at'),
    mode: record.mode,
    teamA: requireStringArray(record.teamA, 'match teamA'),
    teamB: requireStringArray(record.teamB, 'match teamB'),
    scoreA,
    scoreB,
    resters: requireStringArray(record.resters, 'match resters'),
    scoringFormat,
  }
}

function normalizeOverride(value: unknown): RatingOverride {
  const record = requireRecord(value, 'override')
  requireExactKeys(record, ['id', 'playerId', 'rating', 'at'])
  return {
    id: requireString(record.id, 'override id'),
    playerId: requireString(record.playerId, 'override playerId'),
    rating: requireFiniteNumber(record.rating, 'override rating'),
    at: requireFiniteNumber(record.at, 'override at'),
  }
}

function normalizeBaseline(value: unknown): RatingBaseline {
  const record = requireRecord(value, 'baseline')
  requireExactKeys(record, ['id', 'playerId', 'rating', 'rd', 'vol', 'at'])
  return {
    id: requireString(record.id, 'baseline id'),
    playerId: requireString(record.playerId, 'baseline playerId'),
    rating: requireFiniteNumber(record.rating, 'baseline rating'),
    rd: requireFiniteNumber(record.rd, 'baseline rd'),
    vol: requireFiniteNumber(record.vol, 'baseline vol'),
    at: requireFiniteNumber(record.at, 'baseline at'),
  }
}

export function normalizeAppData(value: unknown): AppData {
  const record = requireRecord(value, 'app data')
  requireExactKeys(record, ['players', 'sessions', 'matches', 'overrides', 'baselines'])
  return {
    players: requireArray(record.players, 'players').map(normalizePlayer),
    sessions: requireArray(record.sessions, 'sessions').map(normalizeSession),
    matches: requireArray(record.matches, 'matches').map(normalizeMatch),
    overrides: requireArray(record.overrides, 'overrides').map(normalizeOverride),
    baselines: requireArray(record.baselines, 'baselines').map(normalizeBaseline),
  }
}

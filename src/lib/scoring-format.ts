export const SCORING_FORMAT_SCHEMA_VERSION = 1 as const

export interface ScoringRules {
  readonly target: number
  readonly winBy: number
  readonly cap: number
}

export interface CatalogScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'catalog'
  readonly formatId: 'badminton-21-w2-c30' | 'badminton-15-w2-c21'
  readonly formatVersion: 1
  readonly rules: ScoringRules
}

export interface CustomScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'custom'
  readonly label: string
  readonly rules: ScoringRules
}

export interface UnknownScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'unknown'
  readonly reason: 'explicit-unknown' | 'legacy-missing'
}

export type ScoringFormatSnapshot = CatalogScoringFormat | CustomScoringFormat | UnknownScoringFormat

type CatalogEntry = Readonly<{ formatId: CatalogScoringFormat['formatId']; formatVersion: 1; rules: ScoringRules }>

function freezeRules(value: unknown): ScoringRules {
  if (!isExactObject(value, ['target', 'winBy', 'cap'])) throw new Error('Invalid scoring rules')
  const { target, winBy, cap } = value as Record<string, unknown>
  if (typeof target !== 'number' || typeof winBy !== 'number' || typeof cap !== 'number' || ![target, winBy, cap].every((number) => Number.isSafeInteger(number) && number > 0)) throw new Error('Scoring rules must be positive safe integers')
  if (winBy > target || target > cap) throw new Error('Invalid scoring rule order')
  return Object.freeze({ target, winBy, cap })
}

export const SCORING_FORMAT_CATALOG: readonly CatalogEntry[] = Object.freeze([
  Object.freeze({ formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: freezeRules({ target: 21, winBy: 2, cap: 30 }) }),
  Object.freeze({ formatId: 'badminton-15-w2-c21', formatVersion: 1, rules: freezeRules({ target: 15, winBy: 2, cap: 21 }) }),
])

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function catalogEntry(id: CatalogScoringFormat['formatId']): CatalogEntry {
  const found = SCORING_FORMAT_CATALOG.find((entry) => entry.formatId === id)
  if (!found) throw new Error('Unsupported catalog format')
  return found
}

export function createCatalogSnapshot(formatId: CatalogScoringFormat['formatId']): CatalogScoringFormat {
  const entry = catalogEntry(formatId)
  return Object.freeze({ schemaVersion: 1, kind: 'catalog', formatId: entry.formatId, formatVersion: entry.formatVersion, rules: freezeRules(entry.rules) })
}

export function createCustomSnapshot(label: string, rules: ScoringRules): CustomScoringFormat {
  if (typeof label !== 'string') throw new Error('Custom label must be a string')
  const trimmed = label.trim()
  const length = Array.from(trimmed).length
  if (length < 1 || length > 40) throw new Error('Custom label must contain 1–40 code points')
  return Object.freeze({ schemaVersion: 1, kind: 'custom', label: trimmed, rules: freezeRules(rules) })
}

export function createUnknownSnapshot(reason: UnknownScoringFormat['reason']): UnknownScoringFormat {
  if (reason !== 'explicit-unknown' && reason !== 'legacy-missing') throw new Error('Invalid unknown format reason')
  return Object.freeze({ schemaVersion: 1, kind: 'unknown', reason })
}

export function reconstructScoringFormat(value: unknown): ScoringFormatSnapshot {
  if (value === null || typeof value !== 'object') throw new Error('Invalid scoring format')
  const record = value as Record<string, unknown>
  if (record.kind === 'catalog') {
    if (!isExactObject(value, ['schemaVersion', 'kind', 'formatId', 'formatVersion', 'rules']) || record.schemaVersion !== 1 || record.formatVersion !== 1 || (record.formatId !== 'badminton-21-w2-c30' && record.formatId !== 'badminton-15-w2-c21')) throw new Error('Invalid catalog scoring format')
    const snapshot = createCatalogSnapshot(record.formatId)
    const rules = freezeRules(record.rules)
    if (rules.target !== snapshot.rules.target || rules.winBy !== snapshot.rules.winBy || rules.cap !== snapshot.rules.cap) throw new Error('Catalog rules do not match version')
    return snapshot
  }
  if (record.kind === 'custom') {
    if (!isExactObject(value, ['schemaVersion', 'kind', 'label', 'rules']) || record.schemaVersion !== 1 || typeof record.label !== 'string') throw new Error('Invalid custom scoring format')
    return createCustomSnapshot(record.label, freezeRules(record.rules))
  }
  if (record.kind === 'unknown') {
    if (!isExactObject(value, ['schemaVersion', 'kind', 'reason']) || record.schemaVersion !== 1 || (record.reason !== 'explicit-unknown' && record.reason !== 'legacy-missing')) throw new Error('Invalid unknown scoring format')
    return createUnknownSnapshot(record.reason)
  }
  throw new Error('Unsupported scoring format schema')
}

export function cloneScoringFormat(snapshot: ScoringFormatSnapshot): ScoringFormatSnapshot {
  return reconstructScoringFormat(JSON.parse(encodeScoringFormat(snapshot)))
}

export function encodeScoringFormat(value: ScoringFormatSnapshot): string {
  const snapshot = reconstructScoringFormat(value)
  if (snapshot.kind === 'catalog') return JSON.stringify({ schemaVersion: 1, kind: 'catalog', formatId: snapshot.formatId, formatVersion: 1, rules: { target: snapshot.rules.target, winBy: snapshot.rules.winBy, cap: snapshot.rules.cap } })
  if (snapshot.kind === 'custom') return JSON.stringify({ schemaVersion: 1, kind: 'custom', label: snapshot.label, rules: { target: snapshot.rules.target, winBy: snapshot.rules.winBy, cap: snapshot.rules.cap } })
  return JSON.stringify({ schemaVersion: 1, kind: 'unknown', reason: snapshot.reason })
}

export function displayScoringFormat(snapshot: ScoringFormatSnapshot): string {
  if (snapshot.kind === 'catalog') return snapshot.formatId === 'badminton-21-w2-c30' ? 'Badminton 21, win by 2, cap 30' : 'Badminton 15, win by 2, cap 21'
  if (snapshot.kind === 'custom') return `Custom: ${snapshot.label} (${snapshot.rules.target}/${snapshot.rules.winBy}/${snapshot.rules.cap})`
  return snapshot.reason === 'legacy-missing' ? 'Unknown (legacy)' : 'Unknown'
}

export function isLegalEndpoint(snapshot: ScoringFormatSnapshot, scoreA: number, scoreB: number): boolean {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB) return false
  if (snapshot.kind === 'unknown') return true
  if (!Number.isSafeInteger(scoreA) || !Number.isSafeInteger(scoreB)) return false
  const winner = Math.max(scoreA, scoreB)
  const loser = Math.min(scoreA, scoreB)
  const { target, winBy, cap } = snapshot.rules
  if (winner === target) return loser <= target - winBy
  if (winner > target && winner < cap) return winner - loser === winBy
  return cap > target && winner === cap && loser >= cap - winBy && loser < cap
}

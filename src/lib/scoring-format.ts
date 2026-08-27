/**
 * 賽制快照：記錄「這場比分是在哪套規則下產生的」。
 *
 * 三種 variant 互斥：catalog（目錄內建）、custom（自訂結構化）、unknown（明確未知）。
 * 快照在開打前凍結並複製進 Match，之後不可修改；缺少賽制的舊資料一律標為
 * legacy-missing，絕不從比分反推——15:12 在兩種目錄賽制下都合法。
 */

export const SCORING_FORMAT_SCHEMA_VERSION = 1 as const

export interface ScoringRules {
  readonly target: number
  readonly winBy: number
  readonly cap: number
}

export type CatalogFormatId = 'badminton-21-w2-c30' | 'badminton-15-w2-c21'

export interface CatalogScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'catalog'
  readonly formatId: CatalogFormatId
  readonly formatVersion: 1
  readonly rules: ScoringRules
}

export interface CustomScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'custom'
  readonly label: string
  readonly rules: ScoringRules
}

export type UnknownReason = 'explicit-unknown' | 'legacy-missing'

export interface UnknownScoringFormat {
  readonly schemaVersion: 1
  readonly kind: 'unknown'
  readonly reason: UnknownReason
}

export type ScoringFormatSnapshot = CatalogScoringFormat | CustomScoringFormat | UnknownScoringFormat

/** 結構化快照＝可用規則驗證終局比分者 */
export type StructuredScoringFormat = CatalogScoringFormat | CustomScoringFormat

interface CatalogEntry {
  readonly formatId: CatalogFormatId
  readonly formatVersion: 1
  readonly rules: ScoringRules
}

const CUSTOM_LABEL_MIN = 1
const CUSTOM_LABEL_MAX = 40

/** 只接受純物件字面值，且 own key 集合完全相符（多一個或少一個都算壞資料） */
function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function freezeRules(value: unknown): ScoringRules {
  if (!isExactObject(value, ['target', 'winBy', 'cap'])) throw new Error('賽制規則格式錯誤')
  const { target, winBy, cap } = value as Record<string, unknown>
  for (const n of [target, winBy, cap]) {
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) {
      throw new Error('賽制規則必須是正的安全整數')
    }
  }
  const rules = { target: target as number, winBy: winBy as number, cap: cap as number }
  if (!(rules.winBy <= rules.target && rules.target <= rules.cap)) {
    throw new Error('賽制規則需滿足 winBy ≦ target ≦ cap')
  }
  return Object.freeze(rules)
}

export const SCORING_FORMAT_CATALOG: readonly CatalogEntry[] = Object.freeze([
  Object.freeze({ formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: freezeRules({ target: 21, winBy: 2, cap: 30 }) }),
  Object.freeze({ formatId: 'badminton-15-w2-c21', formatVersion: 1, rules: freezeRules({ target: 15, winBy: 2, cap: 21 }) }),
] as const)

function catalogEntry(formatId: unknown): CatalogEntry {
  const found = SCORING_FORMAT_CATALOG.find((entry) => entry.formatId === formatId)
  if (!found) throw new Error('不支援的目錄賽制')
  return found
}

export function createCatalogSnapshot(formatId: CatalogFormatId): CatalogScoringFormat {
  const entry = catalogEntry(formatId)
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'catalog' as const,
    formatId: entry.formatId,
    formatVersion: entry.formatVersion,
    rules: freezeRules(entry.rules),
  })
}

export function createCustomSnapshot(label: unknown, rules: unknown): CustomScoringFormat {
  if (typeof label !== 'string') throw new Error('自訂賽制名稱必須是字串')
  const trimmed = label.trim()
  const length = Array.from(trimmed).length
  if (length < CUSTOM_LABEL_MIN || length > CUSTOM_LABEL_MAX) {
    throw new Error(`自訂賽制名稱需 ${CUSTOM_LABEL_MIN}–${CUSTOM_LABEL_MAX} 個字`)
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'custom' as const,
    label: trimmed,
    rules: freezeRules(rules),
  })
}

export function createUnknownSnapshot(reason: UnknownReason): UnknownScoringFormat {
  if (reason !== 'explicit-unknown' && reason !== 'legacy-missing') {
    throw new Error('未知賽制的來源標記無效')
  }
  return Object.freeze({ schemaVersion: 1 as const, kind: 'unknown' as const, reason })
}

/**
 * 從未信任的值（localStorage / CSV）重建快照。
 * 一律重建而非型別斷言，讓 runtime 不可變性支撐 TypeScript 的 readonly。
 */
export function reconstructScoringFormat(value: unknown): ScoringFormatSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('賽制快照格式錯誤')
  }
  const record = value as Record<string, unknown>

  if (record.kind === 'catalog') {
    if (
      !isExactObject(value, ['schemaVersion', 'kind', 'formatId', 'formatVersion', 'rules']) ||
      record.schemaVersion !== SCORING_FORMAT_SCHEMA_VERSION ||
      record.formatVersion !== 1
    ) throw new Error('目錄賽制快照格式錯誤')
    const entry = catalogEntry(record.formatId)
    const rules = freezeRules(record.rules)
    if (rules.target !== entry.rules.target || rules.winBy !== entry.rules.winBy || rules.cap !== entry.rules.cap) {
      throw new Error('目錄賽制的規則與該版本不符')
    }
    return createCatalogSnapshot(entry.formatId)
  }

  if (record.kind === 'custom') {
    if (
      !isExactObject(value, ['schemaVersion', 'kind', 'label', 'rules']) ||
      record.schemaVersion !== SCORING_FORMAT_SCHEMA_VERSION
    ) throw new Error('自訂賽制快照格式錯誤')
    return createCustomSnapshot(record.label, record.rules)
  }

  if (record.kind === 'unknown') {
    if (
      !isExactObject(value, ['schemaVersion', 'kind', 'reason']) ||
      record.schemaVersion !== SCORING_FORMAT_SCHEMA_VERSION
    ) throw new Error('未知賽制快照格式錯誤')
    return createUnknownSnapshot(record.reason as UnknownReason)
  }

  throw new Error('不支援的賽制快照類型')
}

export function isStructured(snapshot: ScoringFormatSnapshot): snapshot is StructuredScoringFormat {
  return snapshot.kind === 'catalog' || snapshot.kind === 'custom'
}

/** 產生等值但完全獨立的快照，避免 session 預設與比賽共用同一個物件 */
export function cloneScoringFormat(snapshot: ScoringFormatSnapshot): ScoringFormatSnapshot {
  return reconstructScoringFormat(JSON.parse(encodeScoringFormat(snapshot)))
}

/** 固定欄位順序的 canonical JSON，供 localStorage 與 CSV 單一欄位使用 */
export function encodeScoringFormat(value: ScoringFormatSnapshot): string {
  const snapshot = reconstructScoringFormat(value)
  if (snapshot.kind === 'catalog') {
    return JSON.stringify({
      schemaVersion: 1,
      kind: 'catalog',
      formatId: snapshot.formatId,
      formatVersion: 1,
      rules: { target: snapshot.rules.target, winBy: snapshot.rules.winBy, cap: snapshot.rules.cap },
    })
  }
  if (snapshot.kind === 'custom') {
    return JSON.stringify({
      schemaVersion: 1,
      kind: 'custom',
      label: snapshot.label,
      rules: { target: snapshot.rules.target, winBy: snapshot.rules.winBy, cap: snapshot.rules.cap },
    })
  }
  return JSON.stringify({ schemaVersion: 1, kind: 'unknown', reason: snapshot.reason })
}

export function decodeScoringFormat(text: string): ScoringFormatSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('賽制快照不是有效的 JSON')
  }
  return reconstructScoringFormat(parsed)
}

export function displayScoringFormat(snapshot: ScoringFormatSnapshot): string {
  if (snapshot.kind === 'catalog') {
    const { target, winBy, cap } = snapshot.rules
    return `${target} 分制（領先 ${winBy} 分、上限 ${cap} 分）`
  }
  if (snapshot.kind === 'custom') {
    const { target, winBy, cap } = snapshot.rules
    return `自訂：${snapshot.label}（${target}／${winBy}／${cap}）`
  }
  return snapshot.reason === 'legacy-missing' ? '未知（舊資料）' : '未知（明確選擇）'
}

/**
 * 終局比分是否合法。三個分支依勝方分數互斥選擇：
 * 打到 target（含 cap === target）／超過 target 未達 cap／觸頂 cap。
 * unknown 快照維持既有寬鬆規則，不因本次變更收緊。
 */
export function isLegalEndpoint(
  snapshot: ScoringFormatSnapshot,
  scoreA: number,
  scoreB: number,
): boolean {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return false
  if (scoreA < 0 || scoreB < 0 || scoreA === scoreB) return false
  if (snapshot.kind === 'unknown') return true
  if (!Number.isSafeInteger(scoreA) || !Number.isSafeInteger(scoreB)) return false

  const winner = Math.max(scoreA, scoreB)
  const loser = Math.min(scoreA, scoreB)
  const { target, winBy, cap } = snapshot.rules
  if (winner === target) return loser <= target - winBy
  if (winner > target && winner < cap) return winner - loser === winBy
  if (cap > target && winner === cap) return loser >= cap - winBy && loser < cap
  return false
}

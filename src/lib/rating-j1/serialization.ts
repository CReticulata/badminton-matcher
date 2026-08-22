export interface GoldenFixture {
  readonly schema: 'rating-j1-golden/v1'
  readonly canonicalInputDigest: string
  readonly canonicalOutputDigest: string
  readonly generatorVersion: string
  readonly sourceCaseId: string
  readonly input: Record<string, unknown>
  readonly expected: {
    readonly legalEndpointScores?: readonly (readonly [number, number])[]
    readonly [key: string]: unknown
  }
  readonly oracleRevision: Record<string, unknown>
}

type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }

const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const HEX_FLOAT_PATTERN = /^[0-9a-f]{16}$/
const APPROVED_GENERATOR_VERSION = 'j1-ts-parity-golden-v1'
const APPROVED_ORACLE_REVISION_DIGEST = '5c018dd0d9ed77ca149f0ee405bed1b38fd893a928575b7b48be53a19febb194'
const FIXTURE_KEYS = Object.freeze([
  'canonicalInputDigest', 'canonicalOutputDigest', 'expected', 'generatorVersion',
  'input', 'oracleRevision', 'schema', 'sourceCaseId',
].sort())

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('canonical JSON rejects non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(asJsonValue)
  if (isRecord(value)) {
    const result: { [key: string]: JsonValue } = {}
    for (const key of Object.keys(value)) result[key] = asJsonValue(value[key])
    return result
  }
  throw new RangeError('value is not valid JSON')
}

export function canonicalJson(value: unknown): string {
  const json = asJsonValue(value)
  const stringify = (item: JsonValue): string => {
    if (item === null || typeof item === 'boolean' || typeof item === 'number' || typeof item === 'string') return JSON.stringify(item)
    if (Array.isArray(item)) return `[${item.map(stringify).join(',')}]`
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stringify(item[key])}`).join(',')}}`
  }
  return stringify(json)
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function floatFromHex(hex: string): number {
  if (!HEX_FLOAT_PATTERN.test(hex)) throw new RangeError('scientific float must be lowercase 16-digit binary64 hex')
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  const value = new DataView(bytes.buffer).getFloat64(0, false)
  if (!Number.isFinite(value)) throw new RangeError('scientific float must be finite')
  return value
}

function validateHexField(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) validateHexField(child)
    return
  }
  if (typeof value !== 'string') throw new RangeError('scientific field must be a string or array of strings')
  floatFromHex(value)
}

function validateScientificValues(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) validateScientificValues(child)
    return
  }
  if (!isRecord(value)) return
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey.endsWith('Hex')) validateHexField(child)
    else validateScientificValues(child)
  }
}

function requireDigest(value: unknown, name: string): string {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) throw new RangeError(`${name} must be a lowercase SHA-256 digest`)
  return value
}

export async function parseAndVerifyGoldenFixture(raw: string, expectedCaseId: string): Promise<GoldenFixture> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new RangeError('fixture is not valid JSON')
  }
  if (!isRecord(parsed) || parsed.schema !== 'rating-j1-golden/v1' || !isRecord(parsed.input) || !isRecord(parsed.expected) || !isRecord(parsed.oracleRevision)) {
    throw new RangeError('fixture does not match rating-j1-golden/v1')
  }
  if (Object.keys(parsed).sort().join('\u0000') !== FIXTURE_KEYS.join('\u0000')) throw new RangeError('fixture top-level fields are invalid')
  if (typeof expectedCaseId !== 'string' || expectedCaseId.length === 0 || parsed.sourceCaseId !== expectedCaseId) {
    throw new RangeError('fixture source case does not match caller expectation')
  }
  if (parsed.generatorVersion !== APPROVED_GENERATOR_VERSION) throw new RangeError('fixture generator version mismatch')
  const inputDigest = requireDigest(parsed.canonicalInputDigest, 'canonicalInputDigest')
  const outputDigest = requireDigest(parsed.canonicalOutputDigest, 'canonicalOutputDigest')
  validateScientificValues(parsed.input)
  validateScientificValues(parsed.expected)
  if (await sha256Hex(canonicalJson(parsed.input)) !== inputDigest) throw new RangeError('canonical input digest mismatch')
  if (await sha256Hex(canonicalJson(parsed.expected)) !== outputDigest) throw new RangeError('canonical output digest mismatch')
  if (!Array.isArray(parsed.oracleRevision.sourceManifest)) throw new RangeError('fixture source manifest is invalid')
  const sourceDigest = requireDigest(parsed.oracleRevision.sourceDigest, 'sourceDigest')
  if (await sha256Hex(canonicalJson(parsed.oracleRevision.sourceManifest)) !== sourceDigest) throw new RangeError('fixture source manifest digest mismatch')
  if (await sha256Hex(canonicalJson(parsed.oracleRevision)) !== APPROVED_ORACLE_REVISION_DIGEST) throw new RangeError('fixture provenance mismatch')
  return parsed as unknown as GoldenFixture
}

import { J1Filter, type J1Preparation, type J1PregameView } from './filter'
import { isLegalEndpoint } from './endpoint'

export interface J1Outcome extends J1PregameView { readonly scoreA: number; readonly scoreB: number }
export interface AuditedJ1Token { readonly eventId: string; readonly version: number; readonly latentMean: number; readonly latentVariance: number }
export interface J1RetentionReceipt { readonly eventId: string; readonly version: number; readonly method: 'J1-CT-96'; readonly latentMean: number; readonly latentVariance: number; readonly prestateEvidenceDigest: string }
interface Pending { readonly publicToken: AuditedJ1Token; readonly filterToken: J1Preparation; readonly view: J1PregameView; readonly prestateEvidenceDigest: string }

function copyView(view: J1PregameView): J1PregameView {
  return Object.freeze({ eventId: view.eventId, activityId: view.activityId, gameIndex: view.gameIndex, completedAtMinute: view.completedAtMinute, activityAttendees: Object.freeze([...view.activityAttendees]), teamA: Object.freeze([view.teamA[0], view.teamA[1]]) as readonly [number, number], teamB: Object.freeze([view.teamB[0], view.teamB[1]]) as readonly [number, number], targetPoints: view.targetPoints, winBy: view.winBy, capPoints: view.capPoints })
}
function sameView(left: J1PregameView, right: J1PregameView): boolean {
  return left.eventId === right.eventId && left.activityId === right.activityId && left.gameIndex === right.gameIndex && left.completedAtMinute === right.completedAtMinute && left.targetPoints === right.targetPoints && left.winBy === right.winBy && left.capPoints === right.capPoints && left.activityAttendees.length === right.activityAttendees.length && left.activityAttendees.every((player, index) => player === right.activityAttendees[index]) && left.teamA[0] === right.teamA[0] && left.teamA[1] === right.teamA[1] && left.teamB[0] === right.teamB[0] && left.teamB[1] === right.teamB[1]
}
function hex64(value: number): string { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, value, false); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') }
function sha256Ascii(text: string): string {
  const bytes = Array.from(text, (char) => char.charCodeAt(0)); const bitLength = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0); for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 255)
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
  for (let base = 0; base < bytes.length; base += 64) { const words = Array.from({ length: 64 }, () => 0); for (let index = 0; index < 16; index += 1) words[index] = ((bytes[base + 4 * index] << 24) | (bytes[base + 4 * index + 1] << 16) | (bytes[base + 4 * index + 2] << 8) | bytes[base + 4 * index + 3]) >>> 0; for (let index = 16; index < 64; index += 1) { const x = words[index - 15], y = words[index - 2]; const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3); const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10); words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0 } let [a,b,c,d,e,f,g,h] = hash; for (let index = 0; index < 64; index += 1) { const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const choice = (e & f) ^ (~e & g); const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0; const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); const majority = (a & b) ^ (a & c) ^ (b & c); [h,g,f,e,d,c,b,a] = [g,f,e,(d + temp1) >>> 0,c,b,a,(temp1 + s0 + majority) >>> 0] } for (let index = 0; index < 8; index += 1) hash[index] = (hash[index] + [a,b,c,d,e,f,g,h][index]) >>> 0 }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}
/** Versioned TS-native SHA-256 snapshot evidence, intentionally not Python stateDigest parity. */
function evidenceDigest(snapshot: ReturnType<J1Filter['snapshot']>): string {
  const state = snapshot.state
  const payload = `j1-ts-evidence-v1:${snapshot.version}:${snapshot.activeActivityId ?? 'none'}:${state.roster.join(',')}:${Array.from(state.mean, hex64).join(',')}:${Array.from(state.covariance, hex64).join(',')}:${snapshot.clocks.map((clock) => clock === null ? 'null' : clock).join(',')}`
  return `j1-ts-evidence-sha256-v1:${sha256Ascii(payload)}`
}

function orderCompare(left: readonly [number, number, number, string], right: readonly [number, number, number, string]): number { for (let index = 0; index < 4; index += 1) { if (left[index] < right[index]) return -1; if (left[index] > right[index]) return 1 } return 0 }

/** Durable-before-publication in-memory retention authority; inject persist for durable storage. */
export class InMemoryJ1RetentionStore {
  private readonly receipts = new Map<string, J1RetentionReceipt>()
  private readonly consumed = new Set<J1RetentionReceipt>()
  private readonly watermarks = new Map<string, readonly [number, number, number, string]>()
  private persisting = false
  private readonly persist: ((record: Readonly<J1RetentionReceipt & { readonly activityId: number; readonly gameIndex: number; readonly completedAtMinute: number }>) => void) | undefined
  constructor(persist?: (record: Readonly<J1RetentionReceipt & { readonly activityId: number; readonly gameIndex: number; readonly completedAtMinute: number }>) => void) { this.persist = persist }
  retain(method: 'J1-CT-96', view: J1PregameView, token: AuditedJ1Token, prestateEvidenceDigest = 'external'): J1RetentionReceipt {
    if (this.persisting) throw new RangeError('retention reentrancy is forbidden')
    const key = `${method}\u0000${view.eventId}`; const order: readonly [number, number, number, string] = [view.completedAtMinute, view.activityId, view.gameIndex, view.eventId]
    const watermark = this.watermarks.get(method)
    if (this.receipts.has(key) || (watermark !== undefined && orderCompare(order, watermark) <= 0)) throw new RangeError('duplicate or non-monotonic retained event')
    const receipt = Object.freeze({ eventId: view.eventId, version: token.version, method, latentMean: token.latentMean, latentVariance: token.latentVariance, prestateEvidenceDigest })
    if (this.persist !== undefined) { this.persisting = true; try { this.persist(Object.freeze({ ...receipt, activityId: view.activityId, gameIndex: view.gameIndex, completedAtMinute: view.completedAtMinute })) } finally { this.persisting = false } }
    if (this.receipts.has(key) || this.watermarks.get(method) !== watermark) throw new RangeError('retention authority changed during persistence')
    this.receipts.set(key, receipt); this.watermarks.set(method, order); return receipt
  }
  verifyAndConsume(receipt: object, method: 'J1-CT-96', view: J1PregameView, token: AuditedJ1Token, digest: string): boolean {
    if (typeof receipt !== 'object' || receipt === null) return false
    const actual = this.receipts.get(`${method}\u0000${view.eventId}`)
    if (actual !== receipt || this.consumed.has(actual)) return false
    if (actual.version !== token.version || actual.latentMean !== token.latentMean || actual.latentVariance !== token.latentVariance || actual.prestateEvidenceDigest !== digest) return false
    this.consumed.add(actual); return true
  }
  watermark(method: 'J1-CT-96'): readonly [number, number, number, string] | undefined { return this.watermarks.get(method) }
}

/** Public audited boundary: prepare → mandatory retention → exact-receipt outcome commit. */
export class AuditedJ1Lifecycle {
  private readonly filter: J1Filter
  private readonly store: InMemoryJ1RetentionStore
  private pending: Pending | null = null
  constructor(roster: readonly number[], options: { readonly sigma: number; readonly omega?: number; readonly initialVariance?: number }, store = new InMemoryJ1RetentionStore()) { this.filter = new J1Filter(roster, options); this.store = store }
  snapshot() { return this.filter.snapshot() }
  get activeActivityId(): number | null { return this.filter.activeActivityId }
  get playerClocks(): readonly (number | null)[] { return this.filter.playerClocks }
  prepare(view: J1PregameView): AuditedJ1Token {
    if (this.pending !== null) throw new RangeError('a preparation is already pending')
    if ('scoreA' in view || 'scoreB' in view) throw new RangeError('score-free J1 pregame view cannot contain an outcome')
    const preparedView = copyView(view); const filterToken = this.filter.prepare(preparedView)
    const publicToken = Object.freeze({ eventId: filterToken.eventId, version: filterToken.version, latentMean: filterToken.prediction.latentMean, latentVariance: filterToken.prediction.latentVariance })
    this.pending = { publicToken, filterToken, view: preparedView, prestateEvidenceDigest: evidenceDigest(this.filter.snapshot()) }; return publicToken
  }
  retain(token: AuditedJ1Token): J1RetentionReceipt {
    const pending = this.pending
    if (pending === null || token !== pending.publicToken) throw new RangeError('stale, foreign, or mismatched J1 preparation')
    return this.store.retain('J1-CT-96', pending.view, token, pending.prestateEvidenceDigest)
  }
  commit(outcome: J1Outcome, receipt: object): void {
    const pending = this.pending
    if (pending === null || !sameView(outcome, pending.view) || !this.store.verifyAndConsume(receipt, 'J1-CT-96', pending.view, pending.publicToken, pending.prestateEvidenceDigest)) throw new RangeError('stale, foreign, mismatched, or unretained J1 preparation')
    // Receipt verification deliberately precedes endpoint validation: an illegal endpoint consumes this oracle identity but cannot mutate scientific state.
    this.pending = null
    if (!isLegalEndpoint(outcome.scoreA, outcome.scoreB)) {
      this.filter.discardPreparation(pending.filterToken)
      throw new RangeError('J1 outcome endpoint metadata is not legal')
    }
    try {
      this.filter.commit(pending.view, pending.filterToken, outcome.scoreA, outcome.scoreB)
    } catch (error) {
      this.filter.discardPreparation(pending.filterToken)
      throw error
    }
  }
  detachedClose(activityId: number) { return this.filter.detachedClose(activityId) }
  finishClose(activityId?: number): void { this.filter.finishClose(activityId) }
}

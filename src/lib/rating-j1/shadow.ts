import { SHADOW_PROTOCOL_VERSION, SHADOW_RUNTIME_VERSION, diagnostics, type ShadowDiagnostics } from './diagnostics'

export interface ShadowPrepareRequest { readonly kind: 'prepare'; readonly correlationId: string; readonly protocolVersion: 'j1-shadow/v1'; readonly runtimeVersion: 'browser-worker/v1'; readonly session: { readonly id: string; readonly mode: 'doubles' | 'singles'; readonly attendeeIds: readonly string[] }; readonly match: { readonly teamA: readonly string[]; readonly teamB: readonly string[]; readonly resters: readonly string[] } }
export interface ShadowOutcomeRequest { readonly kind: 'outcome'; readonly correlationId: string; readonly token: string; readonly scoreA: number; readonly scoreB: number }
export interface ShadowPrepared { readonly kind: 'prepared'; readonly correlationId: string; readonly token: string; readonly protocolVersion: 'j1-shadow/v1'; readonly runtimeVersion: 'browser-worker/v1'; readonly evidenceDigest: string; readonly elapsedMs: number }
export type ShadowResponse = ShadowPrepared | ShadowDiagnostics
export interface ShadowPort { readonly prepare: (request: ShadowPrepareRequest) => Promise<unknown>; readonly outcome: (request: ShadowOutcomeRequest) => Promise<unknown> | unknown }

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function freezeCopy<T>(value: T): T { if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy)) as T; if (isObject(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeCopy(item)]))) as T; return value }
const PREPARED_KEYS = ['correlationId', 'elapsedMs', 'evidenceDigest', 'kind', 'protocolVersion', 'runtimeVersion', 'token'] as const
function prepared(value: unknown, correlationId: string): value is ShadowPrepared { return isObject(value) && Object.keys(value).sort().join('\u0000') === PREPARED_KEYS.join('\u0000') && value.kind === 'prepared' && value.correlationId === correlationId && typeof value.token === 'string' && value.token.length > 0 && value.protocolVersion === SHADOW_PROTOCOL_VERSION && value.runtimeVersion === SHADOW_RUNTIME_VERSION && typeof value.evidenceDigest === 'string' && /^[0-9a-f]{64}$/.test(value.evidenceDigest) && typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 }

export function ordinaryPrepare(correlationId: string, session: { id: string; mode: 'doubles' | 'singles'; attendeeIds: readonly string[] }, match: { teamA: readonly string[]; teamB: readonly string[]; resters: readonly string[] }): ShadowPrepareRequest {
  return freezeCopy({ kind: 'prepare', correlationId, protocolVersion: SHADOW_PROTOCOL_VERSION, runtimeVersion: SHADOW_RUNTIME_VERSION, session: { id: session.id, mode: session.mode, attendeeIds: [...session.attendeeIds] }, match: { teamA: [...match.teamA], teamB: [...match.teamB], resters: [...match.resters] } })
}

export function createJ1ShadowAdapter(port: ShadowPort | null) {
  const active = new Map<string, symbol>()
  return Object.freeze({
    async prepare(request: ShadowPrepareRequest): Promise<{ readonly correlationId: string; readonly token: string } | null> { if (!port) return null; const marker = Symbol(request.correlationId); active.set(request.correlationId, marker); try { const response = await port.prepare(freezeCopy(request)); if (active.get(request.correlationId) === marker && prepared(response, request.correlationId)) return Object.freeze({ correlationId: response.correlationId, token: response.token }); if (active.get(request.correlationId) === marker) active.delete(request.correlationId); return null } catch { if (active.get(request.correlationId) === marker) active.delete(request.correlationId); return null } },
    invalidate(correlationId: string): void { active.delete(correlationId) },
    outcome(request: ShadowOutcomeRequest): void { if (!port || !active.has(request.correlationId)) return; active.delete(request.correlationId); try { void Promise.resolve(port.outcome(freezeCopy(request))).catch(() => undefined) } catch { /* best effort */ } },
    unavailable(correlationId: string): ShadowDiagnostics { return diagnostics(correlationId, 'unavailable', 'ORDINARY_PWA_UNAVAILABLE') },
  })
}
export type J1ShadowAdapter = ReturnType<typeof createJ1ShadowAdapter>

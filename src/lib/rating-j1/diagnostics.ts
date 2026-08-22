export type ShadowEligibility = 'eligible' | 'unavailable'
export type ShadowErrorCode = 'ORDINARY_PWA_UNAVAILABLE' | 'INVALID_REQUEST' | 'INVALID_RESPONSE' | 'WORKER_FAILURE' | 'STALE_PREPARATION'

export interface ShadowDiagnostics {
  readonly kind: 'diagnostics'
  readonly correlationId: string
  readonly eligibility: ShadowEligibility
  readonly protocolVersion: 'j1-shadow/v1'
  readonly runtimeVersion: 'browser-worker/v1'
  readonly evidenceDigest: string
  readonly elapsedMs: number
  readonly errorCode?: ShadowErrorCode
}

export const SHADOW_PROTOCOL_VERSION = 'j1-shadow/v1' as const
export const SHADOW_RUNTIME_VERSION = 'browser-worker/v1' as const

export function diagnosticDigest(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8)
}

export function diagnostics(correlationId: string, eligibility: ShadowEligibility, errorCode?: ShadowErrorCode, evidence: unknown = correlationId): ShadowDiagnostics {
  return Object.freeze({ kind: 'diagnostics', correlationId, eligibility, protocolVersion: SHADOW_PROTOCOL_VERSION, runtimeVersion: SHADOW_RUNTIME_VERSION, evidenceDigest: diagnosticDigest(evidence), elapsedMs: 0, ...(errorCode === undefined ? {} : { errorCode }) })
}

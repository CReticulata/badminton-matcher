import { assessStrictEligibility, type StrictEligibilityInput } from './eligibility'
import { diagnostics, diagnosticDigest, SHADOW_PROTOCOL_VERSION, SHADOW_RUNTIME_VERSION, type ShadowDiagnostics } from './diagnostics'
import { selectJ1CT96, type J1SelectorEvent } from './selection'
import type { ShadowPrepareRequest, ShadowResponse } from './shadow'

export interface StrictHistoryRequest { readonly kind: 'strict-history'; readonly correlationId: string; readonly protocolVersion: 'j1-shadow/v1'; readonly runtimeVersion: 'browser-worker/v1'; readonly input: StrictEligibilityInput }
type Request = ShadowPrepareRequest | StrictHistoryRequest
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Pure worker protocol: only diagnostics leave this module; selectors never expose surface or players. */
export function handleShadowMessage(value: unknown): ShadowResponse | ShadowDiagnostics {
  if (!object(value) || typeof value.kind !== 'string' || typeof value.correlationId !== 'string' || value.protocolVersion !== SHADOW_PROTOCOL_VERSION || value.runtimeVersion !== SHADOW_RUNTIME_VERSION) return diagnostics('invalid', 'unavailable', 'INVALID_REQUEST')
  const request = value as unknown as Request
  if (request.kind === 'prepare') return diagnostics(request.correlationId, 'unavailable', 'ORDINARY_PWA_UNAVAILABLE', request)
  if (request.kind !== 'strict-history' || !object(request.input)) return diagnostics(request.correlationId, 'unavailable', 'INVALID_REQUEST')
  try {
    const input = request.input
    const report = assessStrictEligibility(input)
    if (!report.eligible) return diagnostics(request.correlationId, 'unavailable', 'INVALID_REQUEST', report.reasons)
    const selection = selectJ1CT96(input.timeZeroRoster as readonly number[], input.events as readonly J1SelectorEvent[])
    return Object.freeze({ kind: 'diagnostics', correlationId: request.correlationId, eligibility: 'eligible', protocolVersion: SHADOW_PROTOCOL_VERSION, runtimeVersion: SHADOW_RUNTIME_VERSION, evidenceDigest: diagnosticDigest({ method: selection.method, sigma: selection.selectedSigma }), elapsedMs: 0 })
  } catch { return diagnostics(request.correlationId, 'unavailable', 'INVALID_REQUEST') }
}

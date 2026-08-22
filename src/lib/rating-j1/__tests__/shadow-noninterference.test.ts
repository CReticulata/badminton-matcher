import { describe, expect, it, vi } from 'vitest'
import { createJ1ShadowAdapter, type ShadowPort, type ShadowPrepareRequest } from '../shadow'
import { handleShadowMessage } from '../worker-handler'
import { createCatalogSnapshot, createCustomSnapshot, createUnknownSnapshot } from '../../scoring-format'
import { addPlayer, configureJ1Shadow, data, endSession, previewNextRound, startMatch, startSession, submitScore, ui } from '../../../store'

const ordinary = { kind: 'prepare' as const, correlationId: 'c1', protocolVersion: 'j1-shadow/v1' as const, runtimeVersion: 'browser-worker/v1' as const, session: { id: 's', mode: 'doubles' as const, attendeeIds: ['a', 'b', 'c', 'd'] }, match: { teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [] } }

describe('J1 shadow capability seam', () => {
  it('keeps the authoritative persisted score and Glicko state identical when the Worker is unavailable', () => {
    const run = (port: ShadowPort | null) => {
      data.players.splice(0); data.sessions.splice(0); data.matches.splice(0); data.overrides.splice(0); data.baselines.splice(0)
      configureJ1Shadow(port)
      const players = ['a', 'b', 'c', 'd'].map((name) => addPlayer(name, 1500))
      startSession(players.map((player) => player.id), createUnknownSnapshot('explicit-unknown'))
      ui.pending = { mode: 'doubles', teamA: [players[0]!.id, players[1]!.id], teamB: [players[2]!.id, players[3]!.id], resters: [], scoringFormat: createUnknownSnapshot('explicit-unknown') }
      startMatch()
      expect(submitScore(21, 19)).toBeNull()
      return { score: data.matches[0] && { scoreA: data.matches[0].scoreA, scoreB: data.matches[0].scoreB, playerCount: data.matches[0].teamA.length + data.matches[0].teamB.length }, states: data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol })) }
    }
    const control = run(null)
    const unavailable = run({ prepare: async () => { throw new Error('offline') }, outcome: () => undefined })
    expect(unavailable).toEqual(control)
  })

  it('copies and freezes a score-free prepare request, then emits outcome only for a retained token', async () => {
    let received: unknown
    const port: ShadowPort = { prepare: async (request) => { received = request; return { kind: 'prepared', correlationId: request.correlationId, token: 'opaque', protocolVersion: request.protocolVersion, runtimeVersion: request.runtimeVersion, evidenceDigest: 'a'.repeat(64), elapsedMs: 1 } }, outcome: vi.fn(async () => ({ kind: 'diagnostics', correlationId: 'c1', eligibility: 'unavailable', protocolVersion: 'j1-shadow/v1', runtimeVersion: 'browser-worker/v1', evidenceDigest: 'a'.repeat(64), elapsedMs: 1, errorCode: 'ORDINARY_PWA_UNAVAILABLE' })) }
    const adapter = createJ1ShadowAdapter(port)
    const preparation = await adapter.prepare(ordinary)
    expect(JSON.stringify(received)).not.toContain('score')
    expect(Object.isFrozen(received)).toBe(true)
    expect(preparation).toEqual({ correlationId: 'c1', token: 'opaque' })
    adapter.outcome({ kind: 'outcome', correlationId: 'c1', token: 'opaque', scoreA: 21, scoreB: 19 })
    await Promise.resolve()
    expect(port.outcome).toHaveBeenCalledOnce()
  })

  it('discards malformed authority-shaped responses and late preparations', async () => {
    let resolve!: (value: any) => void
    const adapter = createJ1ShadowAdapter({ prepare: () => new Promise((r) => { resolve = r }), outcome: vi.fn() })
    const pending = adapter.prepare(ordinary)
    adapter.invalidate('c1')
    resolve({ kind: 'prepared', correlationId: 'c1', token: 'x', rating: 3000 })
    expect(await pending).toBeNull()
  })

  it('accepts only the exact prepared response allowlist with finite nonnegative runtime', async () => {
    const response = { kind: 'prepared', correlationId: 'c1', token: 'x', protocolVersion: 'j1-shadow/v1', runtimeVersion: 'browser-worker/v1', evidenceDigest: 'a'.repeat(64), elapsedMs: 0 }
    for (const invalid of [{ ...response, extra: true }, { ...response, elapsedMs: Number.NaN }, { ...response, elapsedMs: -1 }]) {
      const adapter = createJ1ShadowAdapter({ prepare: async () => invalid, outcome: vi.fn() })
      expect(await adapter.prepare(ordinary)).toBeNull()
    }
  })

  it('keeps full authority and matchmaking identical across success, malformed, failed, late, and disabled paths', async () => {
    type Mode = 'disabled' | 'success' | 'malformed' | 'failed' | 'late'
    const run = async (mode: Mode) => {
      data.players.splice(0); data.sessions.splice(0); data.matches.splice(0); data.overrides.splice(0); data.baselines.splice(0)
      data.players.push(...['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, name: id, color: '#000000', rating: 1400 + index * 50, rd: 350, vol: 0.06, initialRating: 1400 + index * 50, createdAt: 0 })))
      data.sessions.push({ id: 'session', name: 'session', startedAt: 0, presentIds: ['a', 'b', 'c', 'd', 'e'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') })
      ui.mode = 'doubles'; ui.live = null; ui.scoring = true
      ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: ['e'], scoringFormat: createUnknownSnapshot('explicit-unknown') }
      let resolveLate: ((value: unknown) => void) | undefined
      const outcome = vi.fn((request) => {
        expect(data.matches).toHaveLength(1)
        expect(data.players.map(({ rating }) => rating)).not.toEqual([1400, 1450, 1500, 1550, 1600])
        expect(Object.isFrozen(request)).toBe(true)
      })
      const valid = (request: ShadowPrepareRequest) => ({ kind: 'prepared', correlationId: request.correlationId, token: 'opaque', protocolVersion: request.protocolVersion, runtimeVersion: request.runtimeVersion, evidenceDigest: 'a'.repeat(64), elapsedMs: 0 })
      const port: ShadowPort | null = mode === 'disabled' ? null : {
        prepare: async (request) => {
          expect(() => { (request.session.attendeeIds as string[])[0] = 'mutated' }).toThrow()
          if (mode === 'failed') throw new Error('offline')
          if (mode === 'late') return await new Promise((resolve) => { resolveLate = resolve })
          if (mode === 'malformed') return { ...valid(request), rating: 9999 }
          return valid(request)
        },
        outcome,
      }
      configureJ1Shadow(port)
      startMatch()
      if (mode !== 'late') { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
      expect(submitScore(21, 19)).toBeNull()
      if (resolveLate) { resolveLate(valid(ordinary)); await Promise.resolve() }
      await Promise.resolve()
      const proposal = previewNextRound()
      return {
        authority: JSON.parse(JSON.stringify({ players: data.players, sessions: data.sessions, matches: data.matches, ui: { live: ui.live, scoring: ui.scoring } })),
        proposal,
        outcomeCalls: outcome.mock.calls.length,
      }
    }
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const now = vi.spyOn(Date, 'now').mockReturnValue(123456)
    try {
      const control = await run('disabled')
      for (const mode of ['success', 'malformed', 'failed', 'late'] as const) {
        const candidate = await run(mode)
        expect(candidate.authority).toEqual(control.authority)
        expect(candidate.proposal).toEqual(control.proposal)
        expect(candidate.outcomeCalls).toBe(mode === 'success' ? 1 : 0)
      }
    } finally { random.mockRestore(); now.mockRestore(); configureJ1Shadow(null) }
  })

  it('never sends a retained token from an abandoned match with a later match outcome', async () => {
    data.players.splice(0); data.sessions.splice(0); data.matches.splice(0); data.overrides.splice(0); data.baselines.splice(0)
    data.players.push(...['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, color: '#000000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 })))
    const outcome = vi.fn()
    let resolveB!: () => void
    configureJ1Shadow({ prepare: async (request) => request.session.id === 'A'
      ? { kind: 'prepared', correlationId: request.correlationId, token: 'A', protocolVersion: request.protocolVersion, runtimeVersion: request.runtimeVersion, evidenceDigest: 'a'.repeat(64), elapsedMs: 0 }
      : await new Promise((resolve) => { resolveB = () => resolve({ kind: 'prepared', correlationId: request.correlationId, token: 'B', protocolVersion: request.protocolVersion, runtimeVersion: request.runtimeVersion, evidenceDigest: 'b'.repeat(64), elapsedMs: 0 }) }), outcome })
    data.sessions.push({ id: 'A', name: 'A', startedAt: 0, presentIds: ['a', 'b', 'c', 'd'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') })
    ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat: createUnknownSnapshot('explicit-unknown') }; startMatch(); await Promise.resolve()
    endSession()
    data.sessions.push({ id: 'B', name: 'B', startedAt: 1, presentIds: ['a', 'b', 'c', 'd'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: createUnknownSnapshot('explicit-unknown') })
    ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat: createUnknownSnapshot('explicit-unknown') }; startMatch()
    expect(submitScore(21, 19)).toBeNull()
    resolveB(); await Promise.resolve()
    expect(outcome).not.toHaveBeenCalled()
    configureJ1Shadow(null)
  })

  it('returns diagnostics-only unavailability for ordinary product data', () => {
    const response = handleShadowMessage(ordinary)
    expect(response).toMatchObject({ kind: 'diagnostics', eligibility: 'unavailable', errorCode: 'ORDINARY_PWA_UNAVAILABLE' })
    expect(JSON.stringify(response)).not.toMatch(/rating|player|score|prediction/i)
  })

  it('keeps official Glicko and future matchmaking format-blind, and rejects illegal known scores before shadow effects', async () => {
    const run = async (snapshot: ReturnType<typeof createCatalogSnapshot> | ReturnType<typeof createCustomSnapshot> | ReturnType<typeof createUnknownSnapshot>, scoreA: number, scoreB: number) => {
      data.players.splice(0); data.sessions.splice(0); data.matches.splice(0); data.overrides.splice(0); data.baselines.splice(0)
      const players = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, name: id, color: '#000000', rating: 1400 + index * 50, rd: 350, vol: 0.06, initialRating: 1400 + index * 50, createdAt: 0 }))
      data.players.push(...players)
      const outcome = vi.fn()
      configureJ1Shadow({ prepare: async (request) => ({ kind: 'prepared', correlationId: request.correlationId, token: 'opaque', protocolVersion: request.protocolVersion, runtimeVersion: request.runtimeVersion, evidenceDigest: 'a'.repeat(64), elapsedMs: 0 }), outcome })
      startSession(players.map((player) => player.id), snapshot)
      ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: ['e'], scoringFormat: snapshot }
      expect(startMatch()).toBe(true)
      await Promise.resolve(); await Promise.resolve()
      const beforeRatings = data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol }))
      const result = submitScore(scoreA, scoreB)
      await Promise.resolve()
      return { result, matches: data.matches.length, ratings: data.players.map(({ rating, rd, vol }) => ({ rating, rd, vol })), beforeRatings, proposal: previewNextRound(), outcomeCalls: outcome.mock.calls.length, live: ui.live }
    }
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const now = vi.spyOn(Date, 'now').mockReturnValue(123456)
    try {
      const catalog = await run(createCatalogSnapshot('badminton-21-w2-c30'), 21, 19)
      const custom = await run(createCustomSnapshot('Club 21', { target: 21, winBy: 2, cap: 30 }), 21, 19)
      const unknown = await run(createUnknownSnapshot('explicit-unknown'), 21, 19)
      expect(catalog.result).toBeNull()
      expect(custom.result).toBeNull()
      expect(unknown.result).toBeNull()
      expect(custom.ratings).toEqual(catalog.ratings)
      expect(unknown.ratings).toEqual(catalog.ratings)
      expect(custom.proposal).toEqual(catalog.proposal)
      expect(unknown.proposal).toEqual(catalog.proposal)
      const illegal = await run(createCatalogSnapshot('badminton-21-w2-c30'), 21, 20)
      expect(illegal.result).not.toBeNull()
      expect(illegal.matches).toBe(0)
      expect(illegal.ratings).toEqual(illegal.beforeRatings)
      expect(illegal.outcomeCalls).toBe(0)
      expect(illegal.live).not.toBeNull()
    } finally { random.mockRestore(); now.mockRestore(); configureJ1Shadow(null) }
  })
})

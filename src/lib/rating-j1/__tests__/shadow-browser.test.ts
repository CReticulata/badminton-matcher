import { describe, expect, it } from 'vitest'
import strictFixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-selector-surface.json?raw'
import { configureJ1Shadow, data, startMatch, submitScore, ui } from '../../../store'
import { createUnknownSnapshot } from '../../scoring-format'

type Fixture = { input: { roster: number[]; prefix: unknown[] } }
const fixture = JSON.parse(strictFixtureText) as Fixture

describe('Chromium J1 shadow Worker', () => {
  it.skipIf(typeof Worker === 'undefined')('starts the production Vite Worker and returns strict diagnostics only', async () => {
    const worker = new Worker(new URL('../../../workers/j1-shadow.worker.ts', import.meta.url), { type: 'module' })
    try {
      const result = await new Promise<any>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('worker timeout')), 80000); worker.onmessage = (event) => { clearTimeout(timer); resolve(event.data) }; worker.onerror = reject; worker.postMessage({ kind: 'strict-history', correlationId: 'strict', protocolVersion: 'j1-shadow/v1', runtimeVersion: 'browser-worker/v1', input: { timeZeroRoster: fixture.input.roster, events: fixture.input.prefix } }) })
      expect(result).toMatchObject({ kind: 'diagnostics', correlationId: 'strict', eligibility: 'eligible' })
      expect(Object.keys(result).sort()).toEqual(['correlationId', 'elapsedMs', 'eligibility', 'evidenceDigest', 'kind', 'protocolVersion', 'runtimeVersion'])
    } finally { worker.terminate() }
  }, 90000)

  it('submits and rates a score without waiting when the Worker is unavailable', () => {
    data.players.splice(0); data.sessions.splice(0); data.matches.splice(0); data.overrides.splice(0); data.baselines.splice(0)
    data.players.push(...['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, color: '#000000', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 })))
    const scoringFormat = createUnknownSnapshot('explicit-unknown')
    data.sessions.push({ id: 'browser', name: 'browser', startedAt: 0, presentIds: ['a', 'b', 'c', 'd'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: scoringFormat })
    ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat }
    ui.live = null; ui.scoring = true
    configureJ1Shadow({ prepare: async () => { throw new Error('unavailable') }, outcome: () => undefined })
    startMatch()
    expect(submitScore(21, 19)).toBeNull()
    expect(data.matches).toHaveLength(1)
    expect(data.matches[0]).toMatchObject({ scoreA: 21, scoreB: 19, teamA: ['a', 'b'], teamB: ['c', 'd'] })
    expect(data.players.map(({ rating }) => rating)).not.toEqual([1500, 1500, 1500, 1500])
    configureJ1Shadow(null)
  })
})

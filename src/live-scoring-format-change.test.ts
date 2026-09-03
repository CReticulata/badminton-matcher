/** @vitest-environment happy-dom */
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as store from './store'
import type { MatchContext, Session } from './types'
import { createCatalogSnapshot } from './lib/scoring-format'
import { STORAGE_KEY } from './lib/persistence'

const FORMAT_21 = createCatalogSnapshot('badminton-21-w2-c30')
const FORMAT_15 = createCatalogSnapshot('badminton-15-w2-c21')

function resetStore() {
  localStorage.clear()
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.pending = null
  store.ui.live = null
  store.ui.scoring = false
  store.persistenceError.value = null
  store.recoveryState.value = { status: 'ready' }
}

function installLiveMatch(): { session: Session; reactiveLive: MatchContext } {
  const live: MatchContext = {
    liveMatchId: 'live-1',
    startedAt: 0,
    mode: 'singles',
    teamA: ['a'],
    teamB: ['b'],
    resters: ['c'],
    scoringFormat: FORMAT_21,
    fairnessPeriodIds: { a: 'period-a', b: 'period-b' },
    rotationWildcard: {
      schemaVersion: 1,
      normalPlayingIds: ['a', 'c'],
      exchangedInId: 'b',
      exchangedOutId: 'c',
    },
  }
  const session: Session = {
    id: 'session-1',
    name: 'session',
    startedAt: 0,
    nextCompletionSequence: 4,
    rotationWildcardCooldownRemaining: 2,
    openingRatings: {},
    participantIds: ['a', 'b', 'c'],
    participantOrderReliable: true,
    addedDuringSessionIds: [],
    presentIds: ['a', 'b', 'c'],
    leftIds: [],
    volunteerRest: [],
    active: true,
    defaultScoringFormat: FORMAT_21,
    attendanceEvents: [{
      id: 'event-1', sessionId: 'session-1', kind: 'join', playerId: 'a', at: 0, sequence: 0,
    }],
    liveMatch: JSON.parse(JSON.stringify(live)) as MatchContext,
  }
  store.data.sessions.push(session)
  store.ui.live = JSON.parse(JSON.stringify(live)) as MatchContext
  return { session: store.data.sessions[0]!, reactiveLive: store.ui.live }
}

describe('live scoring-format replacement', () => {
  beforeEach(resetStore)
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('durably replaces only the expected live match scoring format', () => {
    const { session, reactiveLive } = installLiveMatch()
    const beforeSession = JSON.parse(JSON.stringify(session)) as Session
    const replacement = createCatalogSnapshot('badminton-15-w2-c21')

    const replaceLiveScoringFormat = (
      store as unknown as {
        replaceLiveScoringFormat: (liveMatchId: string, format: typeof replacement) => unknown
      }
    ).replaceLiveScoringFormat
    const result = replaceLiveScoringFormat('live-1', replacement)

    expect(result).toEqual({ ok: true, liveMatchId: 'live-1' })
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(session.liveMatch?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.live?.scoringFormat).not.toBe(replacement)
    expect(session.liveMatch?.scoringFormat).not.toBe(replacement)
    expect(store.ui.live?.scoringFormat).not.toBe(session.liveMatch?.scoringFormat)

    const afterSession = JSON.parse(JSON.stringify(session)) as Session
    expect({ ...afterSession, liveMatch: undefined }).toEqual({ ...beforeSession, liveMatch: undefined })
    expect({ ...store.ui.live, scoringFormat: undefined }).toEqual({ ...reactiveLive, scoringFormat: undefined })
    expect(session.defaultScoringFormat).toEqual(FORMAT_21)

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { sessions: Session[] }
    expect(persisted.sessions[0]?.liveMatch?.liveMatchId).toBe('live-1')
    expect(persisted.sessions[0]?.liveMatch?.scoringFormat).toEqual(FORMAT_15)
  })

  it('rejects a blocked recovery state without mutation or persistence', () => {
    installLiveMatch()
    store.recoveryState.value = { status: 'blocked', raw: '{broken', message: 'blocked' }
    const before = JSON.stringify({ data: store.data, live: store.ui.live })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: false, reason: 'blocked' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rejects when there is no active session', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: false, reason: 'no-active-session' })
    expect(setItem).not.toHaveBeenCalled()
  })

  it.each([
    ['reactive', () => { store.ui.live = null }],
    ['recoverable', () => { delete store.data.sessions[0]!.liveMatch }],
  ])('rejects a missing %s live authority', (_label, removeAuthority) => {
    installLiveMatch()
    removeAuthority()
    const before = JSON.stringify({ data: store.data, live: store.ui.live })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: false, reason: 'missing-live-match' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rejects mutually inconsistent live authorities', () => {
    const { session } = installLiveMatch()
    session.liveMatch = { ...session.liveMatch!, liveMatchId: 'other-live' }
    const before = JSON.stringify({ data: store.data, live: store.ui.live })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: false, reason: 'live-authority-mismatch' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rejects a stale expected live-match identity', () => {
    installLiveMatch()
    const before = JSON.stringify({ data: store.data, live: store.ui.live })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('stale-live', FORMAT_15)).toEqual({ ok: false, reason: 'stale-live-match' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rejects an invalid replacement snapshot before persistence', () => {
    installLiveMatch()
    const before = JSON.stringify({ data: store.data, live: store.ui.live })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(store.replaceLiveScoringFormat('live-1', { kind: 'catalog' } as never)).toEqual({ ok: false, reason: 'invalid-format' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('recovers the replacement as the only format for the same live match', async () => {
    installLiveMatch()

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: true, liveMatchId: 'live-1' })
    await nextTick()
    vi.resetModules()
    const reloaded = await import('./store')

    expect(reloaded.recoveryState.value).toEqual({ status: 'ready' })
    expect(reloaded.ui.live?.liveMatchId).toBe('live-1')
    expect(reloaded.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(reloaded.currentSession.value?.liveMatch?.scoringFormat).toEqual(FORMAT_15)
  })

  it('does not retry a rejected candidate or clear its warning during watcher flush', async () => {
    installLiveMatch()
    await nextTick()
    store.persistData()
    const persistedBefore = localStorage.getItem(STORAGE_KEY)
    const stateBefore = JSON.stringify({ data: store.data, live: store.ui.live })
    const backingStorage = localStorage
    let applicationWrites = 0
    const setItem = vi.fn((key: string, value: string) => {
      if (key === STORAGE_KEY && ++applicationWrites === 1) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      backingStorage.setItem(key, value)
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backingStorage.getItem(key),
      setItem,
      removeItem: (key: string) => backingStorage.removeItem(key),
    })

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: false, reason: 'persistence-failed' })
    expect(JSON.stringify({ data: store.data, live: store.ui.live })).toBe(stateBefore)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(persistedBefore)
    expect(store.persistenceError.value).toMatch(/尚未儲存/)

    await nextTick()
    expect(applicationWrites).toBe(1)
    expect(store.persistenceError.value).toMatch(/尚未儲存/)
    expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(1)

    expect(store.replaceLiveScoringFormat('live-1', FORMAT_15)).toEqual({ ok: true, liveMatchId: 'live-1' })
    expect(store.persistenceError.value).toBeNull()
  })
})

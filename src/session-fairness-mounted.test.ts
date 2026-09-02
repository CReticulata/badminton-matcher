/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionView from './components/SessionView.vue'
import MatchDisplay from './components/MatchDisplay.vue'
import * as store from './store'
import { createDefaultSessionSnapshot } from './lib/scoring-format'

const format = createDefaultSessionSnapshot()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  localStorage.clear()
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.mode = 'singles'
  store.ui.pending = null
  store.ui.live = null
  store.ui.scoring = false
  store.refreshFairnessNow()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function startTwoPlayers() {
  const players = ['A', 'B'].map((name) => store.addPlayer(name, 1500))
  store.startSession(players.map((player) => player.id), format)
  const session = store.currentSession.value!
  const periods = Object.fromEntries(players.map((player) => [
    player.id,
    session.attendanceEvents!.find((event) => event.kind === 'fairness-period-started' && event.playerId === player.id)!.id,
  ]))
  return { players, session, periods }
}

describe('active fairness mounted lifecycle', () => {
  it('refreshes rates each minute without persisting events and clears its timer on unmount', async () => {
    const { players, session, periods } = startTwoPlayers()
    store.data.matches.push({
      id: 'm1', sessionId: session.id, at: 100_001, mode: 'singles',
      teamA: [players[0]!.id], teamB: [players[1]!.id], scoreA: 15, scoreB: 10,
      resters: [], scoringFormat: format, fairnessPeriodIds: periods,
    })
    vi.setSystemTime(160_000)
    store.refreshFairnessNow()
    const eventCount = session.attendanceEvents!.length
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const wrapper = mount(SessionView)

    expect(wrapper.text()).toContain('上場率 60.00/時・今日 1 場')
    const fairnessTimerIndex = intervalSpy.mock.calls.findIndex((call) => call[1] === 60_000)
    const fairnessTimer = intervalSpy.mock.results[fairnessTimerIndex]?.value
    expect(fairnessTimer).toBeDefined()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.text()).toContain('上場率 30.00/時・今日 1 場')
    expect(session.attendanceEvents).toHaveLength(eventCount)

    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalledWith(fairnessTimer)
  })

  it('refreshes voluntary-rest state immediately from an authoritative event', async () => {
    startTwoPlayers()
    const wrapper = mount(SessionView)
    const restButton = wrapper.findAll('button').find((button) => button.text() === '自願休息')!
    await restButton.trigger('click')
    expect(wrapper.text()).toContain('自願休息中')
    expect(store.currentSession.value!.attendanceEvents!.at(-1)).toMatchObject({ kind: 'voluntary-rest-start' })
    wrapper.unmount()
  })

  it('omits reset controls from the live overlay while retaining the active-session reset action', async () => {
    const { players, session, periods } = startTwoPlayers()
    const live = {
      liveMatchId: 'live-1', startedAt: 100_001, mode: 'singles' as const,
      teamA: [players[0]!.id], teamB: [players[1]!.id], resters: [],
      scoringFormat: format, fairnessPeriodIds: periods,
    }
    store.ui.live = live
    session.liveMatch = live
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const liveWrapper = mount(MatchDisplay)

    expect(liveWrapper.text()).not.toContain('賽後重置')
    expect(liveWrapper.findAll('button').some((button) => button.text().startsWith('重置 '))).toBe(false)

    const sessionWrapper = mount(SessionView)
    const resetA = sessionWrapper.findAll('button').find((button) => button.text() === '重置上場率')!
    await resetA.trigger('click')
    expect(confirm).toHaveBeenCalledWith('重置上場率不會更動今日上場總數或 Rating。確定重置？')
    expect(sessionWrapper.text()).toContain('重置待本場結束')
    expect(session.attendanceEvents!.at(-1)).toMatchObject({
      kind: 'fairness-reset-requested', playerId: players[0]!.id, liveMatchId: 'live-1',
    })
    sessionWrapper.unmount()
    liveWrapper.unmount()
  })
})

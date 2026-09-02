import { beforeEach, describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SessionView from './components/SessionView.vue'
import MatchDisplay from './components/MatchDisplay.vue'
import HistoryView from './components/HistoryView.vue'
import * as store from './store'
import { createUnknownSnapshot } from './lib/scoring-format'

const TEST_FORMAT = createUnknownSnapshot('explicit-unknown')

beforeEach(() => {
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.mode = 'singles'
  store.ui.pending = null
  store.ui.live = null
})

describe('active-session fairness display', () => {
  it('shows two-decimal play rate, daily total, and reset only in a secondary menu', async () => {
    const players = ['A', 'B'].map((name) => store.addPlayer(name, 1500))
    store.startSession(players.map((player) => player.id), TEST_FORMAT)

    const html = await renderToString(createSSRApp(SessionView))
    expect(html).toContain('上場率 0.00/時・今日 0 場')
    expect(html).toContain('<summary')
    expect(html).toContain('更多')
    expect(html).toContain('重置上場率')
    expect(html).not.toContain('公平帶')
  })

  it('does not add play-rate output to ended-session history', async () => {
    const player = store.addPlayer('A', 1500)
    store.startSession([player.id], TEST_FORMAT)
    store.endSession()

    const html = await renderToString(createSSRApp(HistoryView))
    expect(html).not.toContain('上場率')
  })

  it('omits fairness-reset controls from the live-match overlay', async () => {
    const players = ['A', 'B'].map((name) => store.addPlayer(name, 1500))
    store.startSession(players.map((player) => player.id), TEST_FORMAT)
    store.ui.live = {
      liveMatchId: 'live-1', startedAt: 1, mode: 'singles',
      teamA: [players[0]!.id], teamB: [players[1]!.id], resters: [],
      scoringFormat: TEST_FORMAT, fairnessPeriodIds: {},
    }

    const html = await renderToString(createSSRApp(MatchDisplay))
    expect(html).not.toContain('賽後重置')
    expect(html).not.toContain('重置 A')
    expect(html).not.toContain('重置 B')
    expect(html).toContain('取消')
    expect(html).toContain('結束比賽')
  })
})

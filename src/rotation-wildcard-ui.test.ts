/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PreviewView from './components/PreviewView.vue'
import MatchDisplay from './components/MatchDisplay.vue'
import SessionView from './components/SessionView.vue'
import HistoryView from './components/HistoryView.vue'
import * as store from './store'
import { createUnknownSnapshot } from './lib/scoring-format'

const format = createUnknownSnapshot('explicit-unknown')
const names = ['A', 'B', 'C', 'D', 'E', 'F'] as const

beforeEach(() => {
  localStorage.clear()
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.pending = null
  store.ui.live = null
  store.ui.scoring = false
  store.ui.mode = 'doubles'
})

function setup() {
  const players = Object.fromEntries(names.map((name) => [name, store.addPlayer(name, 1500)]))
  store.startSession(Object.values(players).map((player) => player.id), format)
  const id = (name: typeof names[number]) => players[name].id
  const pending = () => ({
    mode: 'doubles' as const,
    teamA: [id('B'), id('C')],
    teamB: [id('D'), id('E')],
    resters: [id('A'), id('F')],
    scoringFormat: format,
    rotationWildcard: {
      schemaVersion: 1 as const,
      normalPlayingIds: [id('A'), id('B'), id('C'), id('D')].sort(),
      exchangedOutId: id('A'),
      exchangedInId: id('E'),
    },
  })
  return { players, id, pending, session: store.currentSession.value! }
}

describe('rotation wildcard preview audit UI', () => {
  it('shows a compact badge and the actual exchange pair', () => {
    const { pending } = setup()
    store.ui.pending = pending()
    const wrapper = mount(PreviewView)
    expect(wrapper.text()).toContain('外卡')
    expect(wrapper.text()).toContain('換入：E')
    expect(wrapper.text()).toContain('換出：A')
  })

  it.each([
    ['exchange-in removal', 'E', 'F'],
    ['exchange-out restoration', 'E', 'A'],
    ['third-seat change', 'B', 'F'],
  ] as const)('removes evidence immediately after %s', async (_label, left, right) => {
    const { id, pending } = setup()
    store.ui.pending = pending()
    const wrapper = mount(PreviewView)
    store.swapInPending(id(left), id(right))
    await nextTick()
    expect(wrapper.text()).not.toContain('換入：E')
    expect(wrapper.text()).not.toContain('換出：A')
  })

  it('retains evidence after a team-only swap', async () => {
    const { id, pending } = setup()
    store.ui.pending = pending()
    const wrapper = mount(PreviewView)
    store.swapInPending(id('B'), id('D'))
    await nextTick()
    expect(wrapper.text()).toContain('換入：E')
    expect(wrapper.text()).toContain('換出：A')
  })
})

describe('rotation wildcard non-preview UI', () => {
  it('does not expose wildcard, cooldown, or fairness-degradation UI during live play and session management', async () => {
    const { pending, session } = setup()
    store.ui.live = { ...pending(), liveMatchId: 'live', startedAt: 1 }
    session.liveMatch = store.ui.live
    session.rotationWildcardCooldownRemaining = 2
    store.refreshFairnessNow()
    const live = mount(MatchDisplay)
    const active = mount(SessionView)
    expect(live.text()).not.toContain('外卡')
    expect(active.text()).not.toContain('外卡冷卻')

    session.rotationWildcardCooldownRemaining = 1
    await nextTick()
    expect(active.text()).not.toContain('外卡冷卻')
    session.rotationWildcardCooldownRemaining = 0
    await nextTick()
    expect(active.text()).not.toContain('外卡冷卻')

    session.rotationWildcardCooldownRemaining = 2
    session.attendanceEvents!.push({
      ...session.attendanceEvents![0]!, sequence: session.attendanceEvents!.length,
    })
    store.refreshFairnessNow()
    await nextTick()
    expect(active.text()).not.toContain('外卡冷卻')
    expect(active.text()).not.toContain('上場率公平目前無法使用')
    expect(active.text()).not.toContain('修復公平計算')
  })
})

describe('rotation wildcard history UI', () => {
  it('does not expose completed wildcard origin or exchange evidence', () => {
    const { id, pending, session } = setup()
    session.active = false
    const wildcard = {
      id: 'wildcard', sessionId: session.id, at: 2, completionSequence: 1,
      mode: 'doubles' as const, teamA: [id('B'), id('C')], teamB: [id('D'), id('E')],
      scoreA: 21, scoreB: 10, resters: [id('A'), id('F')], scoringFormat: format,
      rotationWildcard: pending().rotationWildcard,
    }
    store.data.matches.push(wildcard, {
      ...wildcard, id: 'manual', at: 3, completionSequence: 2, rotationWildcard: undefined,
    })
    session.nextCompletionSequence = 3

    const wrapper = mount(HistoryView)
    expect(wrapper.text()).not.toContain('輪替外卡')
    expect(wrapper.text()).not.toContain('換入 E')
    expect(wrapper.text()).not.toContain('換出 A')
    expect(wrapper.text()).not.toContain('上場率')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SessionView from './components/SessionView.vue'
import * as store from './store'

function resetStore() {
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.mode = 'doubles'
  store.ui.pending = null
  store.ui.live = null
}

beforeEach(() => {
  resetStore()
})

describe('next-round preview removal', () => {
  it('keeps the preview entry point out of the public store surface', () => {
    expect(Object.hasOwn(store, 'previewNextRound')).toBe(false)
  })

  it('renders an active session without a next-round preview', async () => {
    const players = ['A', 'B', 'C', 'D', 'E'].map((name) =>
      store.addPlayer(name, 1500),
    )
    store.startSession(players.map((player) => player.id))

    const html = await renderToString(createSSRApp(SessionView))

    expect(html).toContain('產生下一場分組')
    expect(html).not.toContain('data-testid="next-round-preview"')
    expect(html).not.toContain('預告：')
  })
})

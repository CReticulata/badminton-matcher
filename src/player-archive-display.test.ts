import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import PlayersView from './components/PlayersView.vue'
import SessionView from './components/SessionView.vue'
import { addPlayer, archivePlayer, data, ui } from './store'

beforeEach(() => {
  data.players.splice(0)
  data.sessions.splice(0)
  data.matches.splice(0)
  data.overrides.splice(0)
  data.baselines.splice(0)
  ui.live = null
  ui.pending = null
})

describe('封存球員 UI', () => {
  it('從一般管理與新活動名單隱藏，已封存區塊預設收合', async () => {
    addPlayer('現役小明', 1500)
    const archived = addPlayer('封存阿華', 1500)
    expect(archivePlayer(archived.id)).toBe(true)

    const playersHtml = await renderToString(createSSRApp(PlayersView))
    const sessionHtml = await renderToString(createSSRApp(SessionView))

    expect(playersHtml).toContain('現役小明')
    expect(playersHtml).toContain('已封存（1）')
    expect(playersHtml).not.toContain('封存阿華')
    expect(sessionHtml).toContain('現役小明')
    expect(sessionHtml).not.toContain('封存阿華')
  })
})

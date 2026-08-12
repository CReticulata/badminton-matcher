import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import HistoryView from './components/HistoryView.vue'
import { addPlayer, data, endSession, ratingReportsBySession, startSession, submitScore, ui } from './store'

const resetStore = () => {
  data.players.splice(0)
  data.sessions.splice(0)
  data.matches.splice(0)
  data.overrides.splice(0)
  data.baselines.splice(0)
  ui.live = null
  ui.scoring = false
}

beforeEach(resetStore)

describe('歷史 rating 顯示', () => {
  it('在姓名上方顯示單場變動，活動摘要按鈕預設收合', async () => {
    const a = addPlayer('小明', 1500)
    const b = addPlayer('阿華', 1500)
    startSession([a.id, b.id])
    const session = data.sessions[0]!
    ui.live = { mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [] }
    expect(submitScore(21, 18)).toBeNull()
    endSession()

    const report = ratingReportsBySession.value.get(session.id)!
    const changes = report.matchChanges.get(data.matches[0]!.id)!
    const aDelta = changes[a.id]! > 0 ? `+${changes[a.id]}` : `−${Math.abs(changes[a.id]!)}`
    const bDelta = changes[b.id]! > 0 ? `+${changes[b.id]}` : `−${Math.abs(changes[b.id]!)}`
    const html = await renderToString(createSSRApp(HistoryView))

    expect(html).toContain('查看活動摘要')
    expect(html).not.toContain('開場分數')
    expect(html).toContain(aDelta)
    expect(html).toContain(bDelta)
    expect(html.indexOf(aDelta)).toBeLessThan(html.indexOf('小明'))
    expect(html.indexOf(bDelta)).toBeLessThan(html.indexOf('阿華'))
    expect(html).not.toContain('→')
  })

  it('已結束但沒有比賽的活動仍提供摘要', async () => {
    const player = addPlayer('旁觀者', 1500)
    startSession([player.id])
    endSession()

    const html = await renderToString(createSSRApp(HistoryView))

    expect(html).toContain('查看活動摘要')
    expect(html).toContain('沒有完成的比賽')
  })

  it('加入順序不可靠的舊活動不顯示整日摘要按鈕', async () => {
    const a = addPlayer('小明', 1500)
    const b = addPlayer('阿華', 1500)
    startSession([a.id, b.id])
    const session = data.sessions[0]!
    session.participantOrderReliable = false
    ui.live = { mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [] }
    expect(submitScore(21, 18)).toBeNull()
    endSession()

    const html = await renderToString(createSSRApp(HistoryView))
    expect(html).not.toContain('查看活動摘要')
    expect(html).toMatch(/[+−]\d+/)
  })
})

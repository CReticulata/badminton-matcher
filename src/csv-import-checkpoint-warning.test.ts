/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PlayersView from './components/PlayersView.vue'
import * as store from './store'
import { createUnknownSnapshot } from './lib/scoring-format'

const format = createUnknownSnapshot('explicit-unknown')

beforeEach(() => {
  localStorage.clear()
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.pending = null
  store.ui.live = null
})

async function chooseCsv(wrapper: ReturnType<typeof mount>, csv: string) {
  const input = wrapper.find('input[type="file"]')
  const file = new File([csv], 'backup.csv', { type: 'text/csv' })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}

describe('CSV full-checkpoint restore warning', () => {
  it('preflights the backup and requires an explicit modal confirmation', async () => {
    const a = store.addPlayer('A', 1500)
    const b = store.addPlayer('B', 1500)
    store.startSession([a.id, b.id], format)
    const session = store.currentSession.value!
    store.ui.live = { mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [], scoringFormat: format }
    expect(store.submitScore(21, 10)).toBeNull()
    store.ui.live = { mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [], scoringFormat: format }
    expect(store.submitScore(21, 10)).toBeNull()
    session.rotationWildcardCooldownRemaining = 2
    const backup = store.exportCsvText()

    session.rotationWildcardCooldownRemaining = 0
    session.nextCompletionSequence = 9
    const wrapper = mount(PlayersView)
    await chooseCsv(wrapper, backup)

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('完整覆蓋')
    expect(dialog.text()).not.toContain('外卡冷卻')
    expect(dialog.text()).toContain('下一完成序號：3')
    expect(dialog.text()).toContain('目前資料與完成順序都會被備份值取代')
    expect(dialog.text()).toContain('先匯出目前資料')
    expect(dialog.text()).toContain('確認覆蓋並匯入')
    expect(session.rotationWildcardCooldownRemaining).toBe(0)
    expect(session.nextCompletionSequence).toBe(9)

    await dialog.findAll('button').find((button) => button.text() === '確認覆蓋並匯入')!.trigger('click')
    expect(store.currentSession.value!.rotationWildcardCooldownRemaining).toBe(2)
    expect(store.currentSession.value!.nextCompletionSequence).toBe(3)
    expect(wrapper.text()).toContain('匯入完成')
  })

  it('offers a current-data export action before confirmation and never opens the old native confirm', async () => {
    const player = store.addPlayer('A', 1500)
    store.startSession([player.id], format)
    const backup = store.exportCsvText()
    const confirm = vi.fn()
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const createUrl = vi.fn(() => 'blob:test')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mount(PlayersView)
    await chooseCsv(wrapper, backup)
    await wrapper.findAll('button').find((button) => button.text() === '先匯出目前資料')!.trigger('click')
    expect(createUrl).toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })
})

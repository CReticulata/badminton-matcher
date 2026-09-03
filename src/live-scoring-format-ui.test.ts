/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ScoreInput from './components/ScoreInput.vue'
import MatchDisplay from './components/MatchDisplay.vue'
import * as store from './store'
import { createCatalogSnapshot } from './lib/scoring-format'
import { exportCsv } from './lib/csv'
import { STORAGE_KEY } from './lib/persistence'
import { applyMatch, type GlickoState } from './lib/glicko2'

const FORMAT_15 = createCatalogSnapshot('badminton-15-w2-c21')

function resetStore() {
  store.data.players.splice(0)
  store.data.sessions.splice(0)
  store.data.matches.splice(0)
  store.data.overrides.splice(0)
  store.data.baselines.splice(0)
  store.ui.pending = null
  store.ui.live = null
  store.ui.scoring = false
  store.ui.mode = 'singles'
  store.recoveryState.value = { status: 'ready' }
}

function installLive(): string {
  const a = store.addPlayer('A', 1500)
  const b = store.addPlayer('B', 1500)
  store.startSession([a.id, b.id], FORMAT_15)
  store.ui.pending = {
    mode: 'singles', teamA: [a.id], teamB: [b.id], resters: [], scoringFormat: FORMAT_15,
  }
  store.startMatch()
  store.ui.scoring = true
  return store.ui.live!.liveMatchId!
}

describe('identity-bound shared score flow', () => {
  beforeEach(resetStore)
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retains raw scores and feedback when the same live match returns from the display', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0]!.setValue('15')
    await inputs[1]!.setValue('14')
    await wrapper.get('button.bg-teal-700').trigger('click')

    expect(wrapper.get('[role="alert"]').text()).toContain('賽制')
    expect(wrapper.text()).toContain('強制結束這場')
    const shared = (store.ui as unknown as {
      scoreFlow: { liveMatchId: string | null; scoreA: string | number; scoreB: string | number; error: string }
    }).scoreFlow
    expect(shared).toEqual(expect.objectContaining({
      liveMatchId, scoreA: 15, scoreB: 14,
    }))
    expect(shared.error).toContain('賽制')

    store.ui.scoring = false
    await nextTick()
    store.ui.scoring = true
    await nextTick()

    expect(wrapper.findAll('input[type="number"]')[0]!.element).toHaveProperty('value', '15')
    expect(wrapper.get('[role="alert"]').text()).toContain('賽制')
  })

  it('clears the owned score flow after successful completion', () => {
    const liveMatchId = installLive()
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 15, scoreB: 9, error: 'old error' })

    expect(store.submitScore(15, 9)).toBeNull()
    expect(store.ui.scoreFlow).toEqual({ liveMatchId: null, scoreA: '', scoreB: '', error: '' })
  })

  it('clears the owned score flow when the live match is cancelled', () => {
    const liveMatchId = installLive()
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 7, scoreB: '', error: 'old error' })

    store.cancelLiveMatch()
    expect(store.ui.scoreFlow).toEqual({ liveMatchId: null, scoreA: '', scoreB: '', error: '' })
  })

  it('does not leak score-flow state into a different live identity installed by CSV import', () => {
    const liveMatchId = installLive()
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 12, scoreB: 10, error: 'old error' })
    const checkpoint = JSON.parse(JSON.stringify(store.data)) as typeof store.data
    checkpoint.sessions[0]!.liveMatch = {
      ...checkpoint.sessions[0]!.liveMatch!,
      liveMatchId: 'imported-live',
    }

    store.importCsvText(exportCsv(checkpoint))

    expect(store.ui.live?.liveMatchId).toBe('imported-live')
    expect(store.ui.scoreFlow).toEqual({ liveMatchId: 'imported-live', scoreA: '', scoreB: '', error: '' })
  })

  it('never persists or restores a score draft', async () => {
    const liveMatchId = installLive()
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 12, scoreB: 10, error: 'old error' })
    store.persistData()

    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('scoreFlow')
    vi.resetModules()
    const reloaded = await import('./store')
    expect(reloaded.ui.scoreFlow).toEqual({ liveMatchId, scoreA: '', scoreB: '', error: '' })
  })

  it('changes a blank score form without a clearing confirmation', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(store.ui.live?.liveMatchId).toBe(liveMatchId)
    expect(store.ui.live?.scoringFormat).toEqual(createCatalogSnapshot('badminton-21-w2-c30'))
    expect(store.currentSession.value?.liveMatch?.scoringFormat).toEqual(createCatalogSnapshot('badminton-21-w2-c30'))
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: '', scoreB: '', error: '' })
  })

  it('keeps keyboard focus inside the live-format dialog and restores the trigger on Escape', async () => {
    installLive()
    const wrapper = mount(ScoreInput, { attachTo: document.body })
    const trigger = wrapper.get<HTMLButtonElement>('button[aria-label="更換本場賽制"]')
    trigger.element.focus()

    await trigger.trigger('click')
    await nextTick()

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]')
    const firstRadio = dialog.get<HTMLInputElement>('input[type="radio"]')
    const cancel = dialog.findAll<HTMLButtonElement>('button').find((button) => button.text() === '取消')!
    expect(document.activeElement).toBe(firstRadio.element)

    firstRadio.element.focus()
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel.element)

    cancel.element.focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(firstRadio.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('treats saving the current format as a no-op that preserves a draft', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    await wrapper.get('input[aria-label="A 隊得分"]').setValue('7')
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 7, scoreB: '', error: '' })
  })

  it('clears the complete non-empty score flow only after confirmed durable success', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    await wrapper.get('input[aria-label="A 隊得分"]').setValue('15')
    await wrapper.get('input[aria-label="B 隊得分"]').setValue('14')
    await wrapper.get('button.bg-teal-700:not([type="button"])').trigger('click')
    expect(store.ui.scoreFlow.error).toContain('賽制')
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(store.ui.live?.scoringFormat).toEqual(createCatalogSnapshot('badminton-21-w2-c30'))
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: '', scoreB: '', error: '' })
  })

  it('preserves format, draft, validation, and editor after a declined confirmation', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 15, scoreB: 14, error: 'old error' })
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 15, scoreB: 14, error: 'old error' })
    expect(wrapper.find('input[type="radio"][value="badminton-21-w2-c30"]').exists()).toBe(true)
  })

  it('discards only the picker draft when picker cancel is used', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 8, scoreB: '', error: '' })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    const cancel = wrapper.findAll('button').find((button) => button.text().trim() === '取消')!
    await cancel.trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 8, scoreB: '', error: '' })
    expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
  })

  it('preserves the complete draft when durable replacement is refused', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 12, scoreB: 10, error: 'old error' })
    await nextTick()
    store.persistData()
    const backingStorage = localStorage
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backingStorage.getItem(key),
      setItem: (key: string, value: string) => {
        if (key === STORAGE_KEY) throw new DOMException('quota exceeded', 'QuotaExceededError')
        backingStorage.setItem(key, value)
      },
      removeItem: (key: string) => backingStorage.removeItem(key),
    })
    vi.stubGlobal('confirm', () => true)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 12, scoreB: 10, error: 'old error' })
    expect(wrapper.text()).toContain('賽制未儲存')
    expect(wrapper.find('input[type="radio"]').exists()).toBe(true)
  })

  it('repeatedly replaces one live match from catalog to custom to unknown', async () => {
    const liveMatchId = installLive()
    const wrapper = mount(ScoreInput)

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="custom"]').setValue()
    await wrapper.get('#score-live-format-label').setValue('11 分友誼賽')
    await wrapper.get('#score-live-format-target').setValue('11')
    await wrapper.get('#score-live-format-cap').setValue('15')
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')
    expect(store.ui.live?.scoringFormat).toMatchObject({ kind: 'custom', label: '11 分友誼賽' })

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="unknown"]').setValue()
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    expect(store.ui.live?.liveMatchId).toBe(liveMatchId)
    expect(store.ui.live?.scoringFormat).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'explicit-unknown' })
    expect(store.currentSession.value?.defaultScoringFormat).toEqual(FORMAT_15)
  })

  it('uses only the final format for completion, Rating, and the next proposal', async () => {
    installLive()
    const wrapper = mount(ScoreInput)
    const initialStates = new Map<string, GlickoState>(store.data.players.map((player) => [
      player.id,
      { rating: player.rating, rd: player.rd, vol: player.vol },
    ]))
    const teamAId = store.ui.live!.teamA[0]!
    const teamBId = store.ui.live!.teamB[0]!

    await wrapper.get('button[aria-label="更換本場賽制"]').trigger('click')
    await wrapper.get('input[type="radio"][value="custom"]').setValue()
    await wrapper.get('#score-live-format-label').setValue('11 分友誼賽')
    await wrapper.get('#score-live-format-target').setValue('11')
    await wrapper.get('#score-live-format-cap').setValue('15')
    await wrapper.get('button[type="button"].bg-teal-700').trigger('click')

    const finalFormat = store.ui.live!.scoringFormat
    const expectedFinal = applyMatch(initialStates, {
      teamA: [teamAId], teamB: [teamBId], scoreA: 11, scoreB: 9, scoringFormat: finalFormat,
    }).get(teamAId)!
    const expectedSessionDefault = applyMatch(initialStates, {
      teamA: [teamAId], teamB: [teamBId], scoreA: 11, scoreB: 9, scoringFormat: FORMAT_15,
    }).get(teamAId)!
    expect(expectedFinal.rating).not.toBeCloseTo(expectedSessionDefault.rating, 10)

    expect(store.submitScore(11, 10)).toContain('賽制')
    expect(store.submitScore(11, 9)).toBeNull()
    expect(store.data.matches).toHaveLength(1)
    expect(store.data.matches[0]!.scoringFormat).toMatchObject({
      kind: 'custom', label: '11 分友誼賽', rules: { target: 11, winBy: 2, cap: 15 },
    })
    const actualWinner = store.data.players.find(({ id }) => id === teamAId)!
    expect({ rating: actualWinner.rating, rd: actualWinner.rd, vol: actualWinner.vol }).toEqual(expectedFinal)

    store.proposeRound()
    expect(store.ui.pending?.scoringFormat).toEqual(FORMAT_15)
  })

  it('does not let a completed snapshot be changed through the former live identity', () => {
    const liveMatchId = installLive()
    const finalFormat = {
      schemaVersion: 1 as const,
      kind: 'custom' as const,
      label: '11 分友誼賽',
      rules: { target: 11, winBy: 2, cap: 15 },
    }
    expect(store.replaceLiveScoringFormat(liveMatchId, finalFormat)).toEqual({ ok: true, liveMatchId })
    expect(store.submitScore(11, 9)).toBeNull()
    const completedBefore = JSON.stringify(store.data.matches[0])

    expect(store.replaceLiveScoringFormat(
      liveMatchId,
      createCatalogSnapshot('badminton-21-w2-c30'),
    )).toEqual({ ok: false, reason: 'missing-live-match' })
    expect(JSON.stringify(store.data.matches[0])).toBe(completedBefore)
    expect(store.data.matches[0]!.scoringFormat).toEqual(finalFormat)
  })

  it('protects a score-entry draft when replacement starts from the live display', async () => {
    const liveMatchId = installLive()
    const scoreInput = mount(ScoreInput)
    await scoreInput.get('input[aria-label="A 隊得分"]').setValue('7')
    const back = scoreInput.findAll('button').find((button) => button.text().includes('返回對戰畫面'))!
    await back.trigger('click')
    const display = mount(MatchDisplay)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await display.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(store.ui.live?.scoringFormat).toEqual(createCatalogSnapshot('badminton-21-w2-c30'))
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: '', scoreB: '', error: '' })
    expect(display.text()).toContain('21 分制')
    store.ui.scoring = true
    await nextTick()
    expect(scoreInput.text()).toContain('21 分制')
  })

  it('supports repeated blank-draft replacement directly from the live display', async () => {
    installLive()
    store.ui.scoring = false
    const display = mount(MatchDisplay)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await display.get('button[type="button"].bg-teal-700').trigger('click')
    expect(display.text()).toContain('21 分制')

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="unknown"]').setValue()
    await display.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(display.text()).toContain('未知（明確選擇）')
    expect(display.text()).toContain('取消')
    expect(display.text()).toContain('結束比賽')
    expect(display.text()).not.toContain('重置上場率')
    expect(display.text()).not.toContain('輪替外卡')
  })

  it('preserves a retained draft when live-display confirmation is declined', async () => {
    const liveMatchId = installLive()
    store.ui.scoring = false
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 9, scoreB: '', error: 'old error' })
    const display = mount(MatchDisplay)
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    await display.get('button[type="button"].bg-teal-700').trigger('click')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 9, scoreB: '', error: 'old error' })
    expect(display.find('input[type="radio"]').exists()).toBe(true)
  })

  it('keeps live-display state intact on picker cancel and authority refusal', async () => {
    const liveMatchId = installLive()
    store.ui.scoring = false
    Object.assign(store.ui.scoreFlow, { liveMatchId, scoreA: 6, scoreB: '', error: '' })
    const display = mount(MatchDisplay)
    vi.stubGlobal('confirm', () => true)

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    const cancel = display.findAll('button').find((button) => button.text().trim() === '取消')!
    await cancel.trigger('click')
    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow.scoreA).toBe(6)

    await display.get('button[aria-label="更換本場賽制"]').trigger('click')
    await display.get('input[type="radio"][value="badminton-21-w2-c30"]').setValue()
    store.currentSession.value!.liveMatch = {
      ...store.currentSession.value!.liveMatch!, liveMatchId: 'different-live',
    }
    await display.get('button[type="button"].bg-teal-700').trigger('click')

    expect(store.ui.live?.scoringFormat).toEqual(FORMAT_15)
    expect(store.ui.scoreFlow).toEqual({ liveMatchId, scoreA: 6, scoreB: '', error: '' })
    expect(display.text()).toContain('目前比賽已變更')
  })
})

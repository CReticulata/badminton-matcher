import { createApp, h, nextTick, type Component } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.vue'
import HistoryView from '../HistoryView.vue'
import MatchDisplay from '../MatchDisplay.vue'
import PreviewView from '../PreviewView.vue'
import RecoveryView from '../RecoveryView.vue'
import ScoreInput from '../ScoreInput.vue'
import ScoringFormatPicker from '../ScoringFormatPicker.vue'
import SessionView from '../SessionView.vue'
import { createCatalogSnapshot, createCustomSnapshot, createUnknownSnapshot, type ScoringFormatSnapshot } from '../../lib/scoring-format'
import { blockedRawData, data, exportCsvText, recoveryState, ui } from '../../store'

const mounts: Array<{ target: HTMLElement; app: ReturnType<typeof createApp> }> = []

function resetStore(): void {
  data.players = [
    { id: 'a', name: 'A', color: '#111111', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
    { id: 'b', name: 'B', color: '#222222', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
    { id: 'c', name: 'C', color: '#333333', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
    { id: 'd', name: 'D', color: '#444444', rating: 1500, rd: 350, vol: 0.06, initialRating: 1500, createdAt: 0 },
  ]
  data.sessions = []
  data.matches = []
  data.overrides = []
  data.baselines = []
  ui.view = 'session'
  ui.pending = null
  ui.live = null
  ui.scoring = false
}

function mount(component: Component, props: Record<string, unknown> = {}): HTMLElement {
  const target = document.createElement('div')
  document.body.append(target)
  const app = createApp(component, props)
  app.mount(target)
  mounts.push({ target, app })
  return target
}

function clickText(root: HTMLElement, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text) as HTMLButtonElement | undefined
  expect(button, `missing button ${text}`).toBeTruthy()
  button!.click()
  return button!
}

function setInput(root: HTMLElement, label: string, value: string): HTMLInputElement {
  const input = [...root.querySelectorAll('input')].find((candidate) => candidate.closest('label')?.textContent?.includes(label)) as HTMLInputElement | undefined
  expect(input, `missing ${label} input`).toBeTruthy()
  input!.value = value
  input!.dispatchEvent(new Event('input', { bubbles: true }))
  return input!
}

function setFile(input: HTMLInputElement, file: File | undefined): void {
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function seedActive(snapshot: ScoringFormatSnapshot = createCatalogSnapshot('badminton-21-w2-c30')): void {
  data.sessions.push({ id: 's', name: 'session', startedAt: 0, presentIds: ['a', 'b', 'c', 'd'], leftIds: [], volunteerRest: [], active: true, defaultScoringFormat: snapshot })
}

async function flush(): Promise<void> { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick() }

afterEach(() => {
  for (const { target, app } of mounts.splice(0)) { app.unmount(); target.remove() }
  resetStore()
  recoveryState.value = 'ready'
  blockedRawData.value = null
  vi.restoreAllMocks()
})

describe('scoring format UI in real Chromium', () => {
  it('requires an explicit 21/15/custom/unknown choice, with no initial catalog selection', async () => {
    resetStore()
    const root = mount(SessionView)
    await flush()
    const picker = root.querySelector('.format-picker')!
    expect(picker.querySelector('[data-testid="format-catalog-21"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(root.querySelector('[data-testid="start-session"]')?.hasAttribute('disabled')).toBe(true)

    clickText(root, '選擇計分賽制')
    await flush()
    expect(picker.querySelector('[data-testid="format-catalog-21"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(picker.querySelector('[data-testid="format-catalog-15"]')?.getAttribute('aria-pressed')).toBe('false')
    clickText(root, '21 分／差 2／30 上限'); clickText(root, '儲存賽制')
    await flush()
    expect(root.textContent).toContain('Badminton 21, win by 2, cap 30')
    clickText(root, 'Badminton 21, win by 2, cap 30'); await flush(); clickText(root, '自訂賽制'); await flush(); clickText(root, '取消'); await flush()
    expect(root.textContent).toContain('Badminton 21, win by 2, cap 30')

    clickText(root, 'Badminton 21, win by 2, cap 30'); await flush(); clickText(root, '15 分／差 2／21 上限'); clickText(root, '儲存賽制')
    await flush()
    expect(root.textContent).toContain('Badminton 15, win by 2, cap 21')

    clickText(root, 'Badminton 15, win by 2, cap 21'); await flush(); clickText(root, '未知賽制'); clickText(root, '儲存賽制')
    await flush()
    expect(root.textContent).toContain('Unknown')

    clickText(root, 'Unknown'); await flush(); clickText(root, '自訂賽制'); await flush()
    setInput(root, '名稱', '社團 11 分'); setInput(root, '目標分數', '11'); setInput(root, '勝分差', '2'); setInput(root, '分數上限', '15')
    clickText(root, '儲存賽制')
    await flush()
    expect(root.textContent).toContain('Custom: 社團 11 分 (11/2/15)')
  })

  it('keeps custom drafts detached, labels every invalid field, announces errors, and focuses the local first invalid input', async () => {
    const saved: unknown[] = []
    const root = mount({ render: () => h(ScoringFormatPicker, { onSave: (snapshot: unknown) => saved.push(snapshot) }) })
    await flush()
    const trigger = clickText(root, '選擇計分賽制')
    clickText(root, '自訂賽制'); await flush()
    setInput(root, '名稱', '')
    setInput(root, '目標分數', '0')
    setInput(root, '勝分差', '3')
    setInput(root, '分數上限', '0')
    clickText(root, '儲存賽制')
    await flush()
    const invalid = [...root.querySelectorAll<HTMLInputElement>('input[aria-invalid="true"]')]
    expect(invalid).toHaveLength(4)
    for (const input of invalid) {
      expect(input.closest('label')?.textContent).toBeTruthy()
      expect(input.getAttribute('aria-describedby')).toBeTruthy()
    }
    expect(root.querySelector('[aria-live="assertive"]')?.textContent).toContain('請修正')
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain('請輸入自訂名稱')
    expect(document.activeElement).toBe(invalid[0])
    expect(saved).toHaveLength(0)

    clickText(root, '取消')
    await flush()
    expect(saved).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
    trigger.click(); await flush(); root.querySelector('.format-draft')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(root.querySelector('.format-draft')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('blocks a legacy active session until save and keeps Cancel/Escape nonblocking unavailable', async () => {
    resetStore(); seedActive(createUnknownSnapshot('legacy-missing'))
    const root = mount(SessionView)
    await flush()
    expect(root.querySelector('[data-testid="legacy-format-heading"]') ?? root.querySelector('#legacy-format-heading')).toBeTruthy()
    expect(root.textContent).not.toContain('產生下一場分組')
    expect([root.querySelector('#legacy-format-heading'), root.querySelector('[data-testid="format-catalog-21"]')]).toContain(document.activeElement)
    expect(root.querySelectorAll('button').length).toBeGreaterThan(0)
    clickText(root, '取消'); await flush()
    expect(root.textContent).not.toContain('產生下一場分組')
    root.querySelector('.format-draft')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(root.textContent).not.toContain('產生下一場分組')
    clickText(root, '未知賽制'); clickText(root, '儲存賽制'); await flush()
    expect(root.textContent).toContain('產生下一場分組')
  })

  it('supports a prospective default and a detached pending override/reset in the mounted preview', async () => {
    resetStore(); seedActive()
    const session = mount(SessionView); await flush()
    clickText(session, 'Badminton 21, win by 2, cap 30'); await flush(); clickText(session, '15 分／差 2／21 上限'); clickText(session, '儲存賽制')
    await flush()
    expect(data.sessions[0]!.defaultScoringFormat.kind).toBe('catalog')
    expect(data.sessions[0]!.defaultScoringFormat.kind === 'catalog' && data.sessions[0]!.defaultScoringFormat.formatId).toBe('badminton-15-w2-c21')
    ui.pending = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat: createCatalogSnapshot('badminton-15-w2-c21') }
    const preview = mount(PreviewView); await flush()
    expect(preview.textContent).toContain('Badminton 15, win by 2, cap 21')
    clickText(preview, 'Badminton 15, win by 2, cap 21'); await flush(); clickText(preview, '21 分／差 2／30 上限'); clickText(preview, '儲存賽制'); await flush()
    expect(ui.pending!.scoringFormat.kind === 'catalog' && ui.pending!.scoringFormat.formatId).toBe('badminton-21-w2-c30')
    expect(data.sessions[0]!.defaultScoringFormat.kind === 'catalog' && data.sessions[0]!.defaultScoringFormat.formatId).toBe('badminton-15-w2-c21')
    clickText(preview, '使用場次預設'); await flush()
    expect(ui.pending!.scoringFormat.kind === 'catalog' && ui.pending!.scoringFormat.formatId).toBe('badminton-15-w2-c21')
  })

  it('shows the same frozen format in match and score views without an editor, while history labels all provenance variants read-only', async () => {
    resetStore(); seedActive()
    ui.live = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat: createCustomSnapshot('凍結', { target: 11, winBy: 2, cap: 15 }) }
    ui.scoring = true
    const match = mount(MatchDisplay); const score = mount(ScoreInput); await flush()
    expect(match.textContent).toContain('Custom: 凍結 (11/2/15)')
    expect(score.textContent).toContain('Custom: 凍結 (11/2/15)')
    expect(match.querySelector('.format-picker')).toBeNull(); expect(score.querySelector('.format-picker')).toBeNull()
    data.matches = [
      { id: 'm1', sessionId: 's', at: 1, mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoreA: 21, scoreB: 19, scoringFormat: createCatalogSnapshot('badminton-21-w2-c30') },
      { id: 'm2', sessionId: 's', at: 2, mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoreA: 11, scoreB: 9, scoringFormat: createCustomSnapshot('社團', { target: 11, winBy: 2, cap: 15 }) },
      { id: 'm3', sessionId: 's', at: 3, mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoreA: 7, scoreB: 3, scoringFormat: createUnknownSnapshot('explicit-unknown') },
    ]
    const history = mount(HistoryView); await flush()
    expect(history.textContent).toContain('Badminton 21, win by 2, cap 30'); expect(history.textContent).toContain('Custom: 社團 (11/2/15)'); expect(history.textContent).toContain('Unknown')
    expect(history.querySelector('.format-picker')).toBeNull()
  })

  it('keeps an illegal frozen-format score live and completes a legal score through the mounted score UI', async () => {
    resetStore(); seedActive()
    const frozen = createCatalogSnapshot('badminton-21-w2-c30')
    ui.live = { mode: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], resters: [], scoringFormat: frozen }
    ui.scoring = true
    const root = mount(ScoreInput); await flush()
    const scoreA = root.querySelector<HTMLInputElement>('input[aria-label="A 隊得分"]')!
    const scoreB = root.querySelector<HTMLInputElement>('input[aria-label="B 隊得分"]')!
    scoreA.value = '21'; scoreA.dispatchEvent(new Event('input', { bubbles: true }))
    scoreB.value = '20'; scoreB.dispatchEvent(new Event('input', { bubbles: true }))
    clickText(root, '儲存並記錄'); await flush()
    expect(root.textContent).toContain('比分不符合此計分賽制')
    expect(ui.live?.scoringFormat).toBe(frozen)
    expect(data.matches).toHaveLength(0)

    scoreB.value = '19'; scoreB.dispatchEvent(new Event('input', { bubbles: true }))
    clickText(root, '儲存並記錄'); await flush()
    expect(data.matches).toHaveLength(1)
    expect(data.matches[0]!.scoringFormat).toEqual(frozen)
    expect(data.matches[0]!.scoringFormat).not.toBe(frozen)
    expect(ui.live).toBeNull()
    expect(ui.scoring).toBe(false)
  })

  it('blocks the App shell and exercises raw download, cancelled/invalid/oversized/valid recovery, and confirmed discard', async () => {
    resetStore(); recoveryState.value = 'blocked'; blockedRawData.value = '{bad json}'
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download) })
    const app = mount(App); await flush()
    expect(app.querySelector('nav')).toBeNull(); expect(app.textContent).not.toContain('羽球對戰分配機')
    expect(document.activeElement?.textContent).toContain('需要資料復原')
    app.querySelector('.recovery-screen')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(recoveryState.value).toBe('blocked')
    clickText(app, '下載原始 JSON'); expect(clicks).toContain('badminton-matcher-recovery.json')
    const input = app.querySelector<HTMLInputElement>('input[type="file"]')!
    setFile(input, undefined); await flush(); expect(recoveryState.value).toBe('blocked')
    const invalid = new File(['not CSV'], 'invalid.csv', { type: 'text/csv' }); setFile(input, invalid); await flush()
    expect(recoveryState.value).toBe('blocked'); expect(blockedRawData.value).toBe('{bad json}')
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.csv', { type: 'text/csv' })
    Object.defineProperty(oversized, 'text', { value: () => { throw new Error('must not read') } })
    setFile(input, oversized); await flush(); expect(app.textContent).toContain('超過 5 MiB'); expect(recoveryState.value).toBe('blocked')
    const valid = new File([exportCsvText()], 'valid.csv', { type: 'text/csv' }); setFile(input, valid); await new Promise((resolve) => setTimeout(resolve, 50)); await flush()
    expect(recoveryState.value).toBe('ready'); expect(blockedRawData.value).toBeNull()

    recoveryState.value = 'blocked'; blockedRawData.value = '{second bad json}'
    const recovery = mount(RecoveryView); await flush()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false); clickText(recovery, '確認捨棄並重新開始'); expect(recoveryState.value).toBe('blocked'); expect(blockedRawData.value).toBe('{second bad json}')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true); clickText(recovery, '確認捨棄並重新開始'); await flush(); expect(recoveryState.value).toBe('ready'); expect(blockedRawData.value).toBeNull()
  })

  it('ignores stale CSV success/error completions and invalidates an in-flight read on unmount', async () => {
    resetStore(); recoveryState.value = 'blocked'; blockedRawData.value = '{bad json}'
    const root = mount(RecoveryView); await flush()
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    const firstText = new Promise<string>((resolve) => { resolveFirst = resolve })
    const secondText = new Promise<string>((resolve) => { resolveSecond = resolve })
    const first = new File(['first'], 'first.csv', { type: 'text/csv' })
    const second = new File(['second'], 'second.csv', { type: 'text/csv' })
    Object.defineProperty(first, 'text', { value: () => firstText })
    Object.defineProperty(second, 'text', { value: () => secondText })

    setFile(input, first)
    setFile(input, second)
    resolveSecond('not CSV')
    await flush()
    expect(recoveryState.value).toBe('blocked')
    expect(root.textContent).toContain('CSV 無法復原')
    resolveFirst(exportCsvText())
    await flush()
    expect(recoveryState.value).toBe('blocked')
    expect(blockedRawData.value).toBe('{bad json}')
    expect(root.textContent).toContain('CSV 無法復原')

    let rejectThird!: (reason: unknown) => void
    const thirdText = new Promise<string>((_resolve, reject) => { rejectThird = reject })
    const third = new File(['third'], 'third.csv', { type: 'text/csv' })
    Object.defineProperty(third, 'text', { value: () => thirdText })
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.csv', { type: 'text/csv' })
    setFile(input, third)
    setFile(input, oversized)
    await flush()
    expect(root.textContent).toContain('超過 5 MiB')
    rejectThird(new Error('late read failure'))
    await flush()
    expect(root.textContent).toContain('超過 5 MiB')

    let resolveUnmounted!: (value: string) => void
    const unmountedText = new Promise<string>((resolve) => { resolveUnmounted = resolve })
    const pending = new File(['pending'], 'pending.csv', { type: 'text/csv' })
    Object.defineProperty(pending, 'text', { value: () => unmountedText })
    setFile(input, pending)
    const mountIndex = mounts.findIndex((mounted) => mounted.target === root)
    expect(mountIndex).toBeGreaterThanOrEqual(0)
    const [mounted] = mounts.splice(mountIndex, 1)
    mounted!.app.unmount(); mounted!.target.remove()
    resolveUnmounted(exportCsvText())
    await flush()
    expect(recoveryState.value).toBe('blocked')
    expect(blockedRawData.value).toBe('{bad json}')
  })

  it('gives every new picker/recovery control a 44px target and has no horizontal overflow at 320px', async () => {
    resetStore(); const root = mount(SessionView); clickText(root, '選擇計分賽制'); await flush(); clickText(root, '自訂賽制'); await flush()
    recoveryState.value = 'blocked'; blockedRawData.value = '{bad json}'; const recovery = mount(RecoveryView); await flush()
    const interactive = [...root.querySelectorAll<HTMLElement>('.format-picker button, .format-picker input'), ...recovery.querySelectorAll<HTMLElement>('button, label')]
    expect(interactive.length).toBeGreaterThan(8)
    for (const element of interactive) {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element)
      expect(Math.max(rect.height, Number.parseFloat(style.minHeight) || 0), element.textContent).toBeGreaterThanOrEqual(44)
    }
    const constrained = document.createElement('div'); constrained.style.cssText = 'width:320px; overflow:hidden; position:absolute; left:-10000px'; document.body.append(constrained)
    const constrainedApp = createApp(SessionView); constrainedApp.mount(constrained); await flush()
    expect(constrained.scrollWidth).toBeLessThanOrEqual(constrained.clientWidth)
    constrainedApp.unmount(); constrained.remove()
  })
})

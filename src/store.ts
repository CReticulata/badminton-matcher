/**
 * 全域 store：Vue reactivity + localStorage 持久化。
 */
import { computed, reactive, ref, watch } from 'vue'
import type { AppData, LiveMatchContext, Match, Mode, PendingMatchContext, Player, RoundProposal, Session } from './types'
import {
  DEFAULT_RD,
  DEFAULT_VOL,
  OVERRIDE_RD,
  applyMatch,
  recalcAll,
  type GlickoState,
} from './lib/glicko2'
import { generateRound, type Candidate } from './lib/matchmaking'
import { nextDefaultColor } from './lib/color'
import { exportCsv, importCsv } from './lib/csv'
import { createJ1ShadowAdapter, ordinaryPrepare, type ShadowPort } from './lib/rating-j1/shadow'
import { normalizeAppData } from './lib/app-data-normalization'
import { cloneScoringFormat, isLegalEndpoint, type ScoringFormatSnapshot } from './lib/scoring-format'

const STORAGE_KEY = 'badminton-matcher:v1'
const BACKUP_KEY = 'badminton-matcher:pre-scoring-format-v1'
const EMPTY_DATA: AppData = { players: [], sessions: [], matches: [], overrides: [], baselines: [] }

export const recoveryState = ref<'ready' | 'blocked'>('ready')
export const blockedRawData = ref<string | null>(null)
let lastPersistedRaw = JSON.stringify(EMPTY_DATA)
let persistenceAvailable = true

const INITIAL_TIERS = [
  '新手階',
  '新手階',
  '新手階',
  '初階',
  '初階',
  '初中階',
  '初中階',
  '中階',
  '中階',
  '中進階',
  '中進階',
  '中進階',
  '高階',
  '高階',
  '高階',
  '職業級',
  '職業級',
  '職業級',
] as const

export const INITIAL_LEVELS = INITIAL_TIERS.map((tier, index) => ({
  level: index + 1,
  tier,
  rating: 800 + index * 100,
}))

function emptyData(): AppData {
  return { players: [], sessions: [], matches: [], overrides: [], baselines: [] }
}

function preserveBackup(raw: string): boolean {
  try {
    if (localStorage.getItem(BACKUP_KEY) !== null) return true
    localStorage.setItem(BACKUP_KEY, raw)
    return localStorage.getItem(BACKUP_KEY) === raw
  } catch {
    return false
  }
}

function blockRecovery(raw: string): AppData {
  recoveryState.value = 'blocked'
  blockedRawData.value = raw
  return emptyData()
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return emptyData()
    const normalized = normalizeAppData(JSON.parse(raw))
    if (!preserveBackup(raw)) return blockRecovery(raw)
    lastPersistedRaw = raw
    return normalized
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw !== null) return blockRecovery(raw)
    } catch {
      persistenceAvailable = false
      /* Storage was unavailable at startup; retain the existing in-memory-only compatibility mode. */
    }
    return emptyData()
  }
}

export const data = reactive<AppData>(loadData())

watch(
  data,
  () => {
    if (recoveryState.value !== 'ready' || !persistenceAvailable) return
    const candidate = JSON.stringify(data)
    try {
      localStorage.setItem(STORAGE_KEY, candidate)
      lastPersistedRaw = candidate
    } catch {
      recoveryState.value = 'blocked'
      blockedRawData.value = lastPersistedRaw
    }
  },
  { deep: true },
)

function writesAllowed(): boolean {
  return recoveryState.value === 'ready'
}

/** Restores a valid CSV candidate atomically while preserving blocked raw data on every failure. */
export function recoverFromCsvText(text: string): boolean {
  if (recoveryState.value !== 'blocked' || blockedRawData.value === null) return false
  let candidate: AppData
  try {
    candidate = importCsv(text)
  } catch {
    return false
  }
  const raw = blockedRawData.value
  if (!preserveBackup(raw)) return false
  try {
    const candidateRaw = JSON.stringify(candidate)
    localStorage.setItem(STORAGE_KEY, candidateRaw)
    lastPersistedRaw = candidateRaw
  } catch {
    return false
  }
  data.players = candidate.players
  data.sessions = candidate.sessions
  data.matches = candidate.matches
  data.overrides = candidate.overrides
  data.baselines = candidate.baselines
  blockedRawData.value = null
  recoveryState.value = 'ready'
  return true
}

/** Explicit destructive recovery boundary. */
export function discardBlockedData(confirmed: boolean): boolean {
  if (!confirmed || recoveryState.value !== 'blocked' || blockedRawData.value === null) return false
  const raw = blockedRawData.value
  if (!preserveBackup(raw)) return false
  try {
    const emptyRaw = JSON.stringify(EMPTY_DATA)
    localStorage.setItem(STORAGE_KEY, emptyRaw)
    lastPersistedRaw = emptyRaw
  } catch {
    return false
  }
  data.players = []
  data.sessions = []
  data.matches = []
  data.overrides = []
  data.baselines = []
  recoveryState.value = 'ready'
  blockedRawData.value = null
  return true
}

/** UI 流程狀態（不持久化） */
export const ui = reactive<{
  view: 'session' | 'players' | 'history'
  /** 待確認的分組（分組預覽） */
  pending: PendingMatchContext | null
  /** 進行中的比賽（對戰顯示畫面） */
  live: LiveMatchContext | null
  /** 顯示比分輸入 */
  scoring: boolean
  mode: Mode
}>({ view: 'session', pending: null, live: null, scoring: false, mode: 'doubles' })

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// Optional diagnostics-only capability. It is intentionally outside reactive/persisted authority state.
let j1Shadow = createJ1ShadowAdapter(null)
let j1Preparation: { readonly correlationId: string; readonly token: string } | null = null
let j1PendingCorrelation: string | null = null

function abandonJ1ShadowPreparation(): void {
  if (j1PendingCorrelation !== null) j1Shadow.invalidate(j1PendingCorrelation)
  j1PendingCorrelation = null
  j1Preparation = null
}

/** Safe test/integration seam: accepts only the capability-limited Worker port, never store state. */
export function configureJ1Shadow(port: ShadowPort | null): void {
  abandonJ1ShadowPreparation()
  j1Shadow = createJ1ShadowAdapter(port)
}

// ---------- 衍生資料 ----------

export const currentSession = computed<Session | null>(
  () => data.sessions.find((s) => s.active) ?? null,
)

export const playerById = computed(() => {
  const m = new Map<string, Player>()
  for (const p of data.players) m.set(p.id, p)
  return m
})

/** 全期比賽/休息次數（參賽者列表用） */
export const totalStats = computed(() => {
  const stats = new Map<string, { played: number; rested: number }>()
  const get = (id: string) => {
    let s = stats.get(id)
    if (!s) {
      s = { played: 0, rested: 0 }
      stats.set(id, s)
    }
    return s
  }
  for (const m of data.matches) {
    for (const id of [...m.teamA, ...m.teamB]) get(id).played++
    for (const id of m.resters) get(id).rested++
  }
  return stats
})

/** 當日（目前場次）上場/休息次數 */
export const sessionStats = computed(() => {
  const stats = new Map<string, { played: number; rested: number }>()
  const sess = currentSession.value
  if (!sess) return stats
  const get = (id: string) => {
    let s = stats.get(id)
    if (!s) {
      s = { played: 0, rested: 0 }
      stats.set(id, s)
    }
    return s
  }
  for (const m of data.matches) {
    if (m.sessionId !== sess.id) continue
    for (const id of [...m.teamA, ...m.teamB]) get(id).played++
    for (const id of m.resters) get(id).rested++
  }
  return stats
})

// ---------- 參賽者 ----------

export function addPlayer(name: string, initialRating: number): Player {
  if (!writesAllowed()) return undefined as unknown as Player
  const p: Player = {
    id: genId(),
    name: name.trim(),
    color: nextDefaultColor(data.players.map((p) => p.color)),
    rating: initialRating,
    rd: DEFAULT_RD,
    vol: DEFAULT_VOL,
    initialRating,
    createdAt: Date.now(),
  }
  data.players.push(p)
  return p
}

export function renamePlayer(id: string, name: string) {
  if (!writesAllowed()) return
  const p = playerById.value.get(id)
  if (p && name.trim()) p.name = name.trim()
}

export function setPlayerColor(id: string, color: string) {
  if (!writesAllowed()) return
  const p = playerById.value.get(id)
  if (p) p.color = color
}

/** 手動覆寫 rating：RD 重設為高值，並記錄事件供全量重算重播 */
export function overrideRating(id: string, rating: number) {
  if (!writesAllowed()) return
  const p = playerById.value.get(id)
  if (!p) return
  data.overrides.push({ id: genId(), playerId: id, rating, at: Date.now() })
  p.rating = rating
  p.rd = OVERRIDE_RD
  p.vol = DEFAULT_VOL
}

/** 僅允許刪除沒有任何比賽紀錄的人 */
export function removePlayer(id: string): boolean {
  if (!writesAllowed()) return false
  const used = data.matches.some(
    (m) => m.teamA.includes(id) || m.teamB.includes(id) || m.resters.includes(id),
  )
  if (used) return false
  data.players = data.players.filter((p) => p.id !== id) as typeof data.players
  data.overrides = data.overrides.filter((o) => o.playerId !== id) as typeof data.overrides
  data.baselines = data.baselines.filter((b) => b.playerId !== id) as typeof data.baselines
  for (const s of data.sessions) {
    s.presentIds = s.presentIds.filter((x) => x !== id)
    s.leftIds = s.leftIds.filter((x) => x !== id)
    s.volunteerRest = s.volunteerRest.filter((x) => x !== id)
  }
  return true
}

// ---------- 場次 ----------

function isDeliberateScoringFormat(snapshot: ScoringFormatSnapshot | null | undefined): snapshot is ScoringFormatSnapshot {
  return snapshot != null && !(snapshot.kind === 'unknown' && snapshot.reason === 'legacy-missing')
}

export function startSession(presentIds: string[], defaultScoringFormat: ScoringFormatSnapshot): void {
  if (!writesAllowed()) return
  if (!isDeliberateScoringFormat(defaultScoringFormat)) throw new Error('An explicit non-legacy scoring format is required')
  abandonJ1ShadowPreparation()
  for (const s of data.sessions) s.active = false
  const now = new Date()
  data.sessions.push({
    id: genId(),
    name: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 場次`,
    startedAt: Date.now(),
    presentIds: [...presentIds],
    leftIds: [],
    volunteerRest: [],
    active: true,
    defaultScoringFormat: cloneScoringFormat(defaultScoringFormat),
  })
  ui.pending = null
  ui.live = null
}

/** Replaces only the prospective session default; null represents an explicit cancelled choice. */
export function setSessionDefaultScoringFormat(snapshot: ScoringFormatSnapshot | null): boolean {
  if (!writesAllowed() || !isDeliberateScoringFormat(snapshot)) return false
  const session = currentSession.value
  if (!session) return false
  session.defaultScoringFormat = cloneScoringFormat(snapshot)
  return true
}

export function endSession() {
  if (!writesAllowed()) return
  abandonJ1ShadowPreparation()
  const s = currentSession.value
  if (s) s.active = false
  ui.pending = null
  ui.live = null
  ui.scoring = false
}

export function joinSession(playerId: string) {
  if (!writesAllowed()) return
  const s = currentSession.value
  if (!s) return
  if (!s.presentIds.includes(playerId)) s.presentIds.push(playerId)
  s.leftIds = s.leftIds.filter((x) => x !== playerId)
}

export function leaveSession(playerId: string) {
  if (!writesAllowed()) return
  const s = currentSession.value
  if (!s) return
  s.presentIds = s.presentIds.filter((x) => x !== playerId)
  s.volunteerRest = s.volunteerRest.filter((x) => x !== playerId)
  if (!s.leftIds.includes(playerId)) s.leftIds.push(playerId)
}

export function toggleVolunteerRest(playerId: string) {
  if (!writesAllowed()) return
  const s = currentSession.value
  if (!s) return
  if (s.volunteerRest.includes(playerId)) {
    s.volunteerRest = s.volunteerRest.filter((x) => x !== playerId)
  } else {
    s.volunteerRest.push(playerId)
  }
}

// ---------- 分組 ----------

function candidates(): Candidate[] {
  const s = currentSession.value
  if (!s) return []
  const stats = sessionStats.value
  return s.presentIds.map((id) => {
    const p = playerById.value.get(id)
    return {
      id,
      playCount: stats.get(id)?.played ?? 0,
      rating: p?.rating ?? 1500,
      volunteerRest: s.volunteerRest.includes(id),
    }
  })
}

export function proposeRound(): boolean {
  if (!writesAllowed()) return false
  const session = currentSession.value
  if (!session || session.defaultScoringFormat.kind === 'unknown' && session.defaultScoringFormat.reason === 'legacy-missing') return false
  const proposal = generateRound(candidates(), ui.mode)
  if (!proposal) return false
  ui.pending = { ...proposal, scoringFormat: cloneScoringFormat(session.defaultScoringFormat) }
  return true
}

/** Selects a detached pre-start override; unavailable once the match has started. */
export function setPendingScoringFormat(snapshot: ScoringFormatSnapshot): boolean {
  if (!writesAllowed() || !ui.pending || ui.live || !isDeliberateScoringFormat(snapshot)) return false
  ui.pending = { mode: ui.pending.mode, teamA: [...ui.pending.teamA], teamB: [...ui.pending.teamB], resters: [...ui.pending.resters], scoringFormat: cloneScoringFormat(snapshot) }
  return true
}

/** Removes a pre-start override by taking a fresh copy of the current default. */
export function resetPendingScoringFormat(): boolean {
  if (!writesAllowed() || !ui.pending || ui.live) return false
  const session = currentSession.value
  if (!session || session.defaultScoringFormat.kind === 'unknown' && session.defaultScoringFormat.reason === 'legacy-missing') return false
  ui.pending = { mode: ui.pending.mode, teamA: [...ui.pending.teamA], teamB: [...ui.pending.teamB], resters: [...ui.pending.resters], scoringFormat: cloneScoringFormat(session.defaultScoringFormat) }
  return true
}

/** 下一場預告（僅供顯示，不進入流程） */
export function previewNextRound(): RoundProposal | null {
  return generateRound(candidates(), ui.mode)
}

/** 分組預覽中：交換兩人位置（隊伍 A/B/休息名單皆可） */
export function swapInPending(idA: string, idB: string) {
  if (!writesAllowed()) return
  const pending = ui.pending
  if (!pending || idA === idB) return
  const lists = [pending.teamA, pending.teamB, pending.resters]
  const locate = (id: string) => {
    for (const list of lists) {
      const i = list.indexOf(id)
      if (i >= 0) return { list, i }
    }
    return null
  }
  const a = locate(idA)
  const b = locate(idB)
  if (!a || !b) return
  const tmp = a.list[a.i]!
  a.list[a.i] = b.list[b.i]!
  b.list[b.i] = tmp
}

export function startMatch(): boolean {
  if (!writesAllowed() || !ui.pending || ui.live) return false
  const session = currentSession.value
  if (!session) return false
  abandonJ1ShadowPreparation()
  const pending = ui.pending
  const live: LiveMatchContext = { mode: pending.mode, teamA: [...pending.teamA], teamB: [...pending.teamB], resters: [...pending.resters], scoringFormat: cloneScoringFormat(pending.scoringFormat) }
  ui.live = live
  ui.pending = null
  const correlationId = genId()
  j1PendingCorrelation = correlationId
  const adapter = j1Shadow
  const request = ordinaryPrepare(correlationId, { id: session.id, mode: live.mode, attendeeIds: session.presentIds }, { teamA: live.teamA, teamB: live.teamB, resters: live.resters })
  // Preparation is deliberately score-free and never participates in the match authority path.
  void adapter.prepare(request).then((prepared) => {
    if (adapter === j1Shadow && j1PendingCorrelation === correlationId && ui.live && prepared?.correlationId === correlationId) j1Preparation = prepared
  }).catch(() => undefined)
  return true
}

export function cancelPending() {
  if (!writesAllowed()) return
  ui.pending = null
}

/** 賽後輸入比分：寫入紀錄、依實際分組更新 rating 與統計 */
export function submitScore(scoreA: number, scoreB: number): string | null {
  if (!writesAllowed()) return '儲存資料需要復原'
  const live = ui.live
  const sess = currentSession.value
  if (!live || !sess) return '沒有進行中的比賽'
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return '比分必須是非負整數'
  }
  if (!isLegalEndpoint(live.scoringFormat, scoreA, scoreB)) return '比分不符合此計分賽制的合法終點'

  const match: Match = {
    id: genId(),
    sessionId: sess.id,
    at: Date.now(),
    mode: live.mode,
    teamA: [...live.teamA],
    teamB: [...live.teamB],
    scoreA,
    scoreB,
    resters: [...live.resters],
    scoringFormat: cloneScoringFormat(live.scoringFormat),
  }
  data.matches.push(match)

  // 即時 Glicko-2 更新（一場＝一個 rating period）
  const states = new Map<string, GlickoState>()
  for (const p of data.players) states.set(p.id, { rating: p.rating, rd: p.rd, vol: p.vol })
  const updated = applyMatch(states, match)
  for (const [id, s] of updated) {
    const p = playerById.value.get(id)
    if (p) {
      p.rating = s.rating
      p.rd = s.rd
      p.vol = s.vol
    }
  }

  ui.live = null
  ui.scoring = false
  const prepared = j1Preparation
  const correlationId = j1PendingCorrelation
  j1Preparation = null
  j1PendingCorrelation = null
  if (prepared && prepared.correlationId === correlationId) j1Shadow.outcome({ kind: 'outcome', correlationId: prepared.correlationId, token: prepared.token, scoreA, scoreB })
  else if (correlationId !== null) j1Shadow.invalidate(correlationId)
  return null
}

// ---------- 歷史修改（全量重算） ----------

function runFullRecalc() {
  const states = recalcAll(data.players, data.matches, data.overrides, data.baselines)
  for (const p of data.players) {
    const s = states.get(p.id)
    if (s) {
      p.rating = s.rating
      p.rd = s.rd
      p.vol = s.vol
    }
  }
}

export function editMatchScore(matchId: string, scoreA: number, scoreB: number): string | null {
  if (!writesAllowed()) return '儲存資料需要復原'
  const m = data.matches.find((x) => x.id === matchId)
  if (!m) return '找不到這場比賽'
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return '比分必須是非負整數'
  }
  if (!isLegalEndpoint(m.scoringFormat, scoreA, scoreB)) return '比分不符合此計分賽制的合法終點'
  m.scoreA = scoreA
  m.scoreB = scoreB
  runFullRecalc()
  return null
}

export function deleteMatch(matchId: string) {
  if (!writesAllowed()) return
  data.matches = data.matches.filter((m) => m.id !== matchId) as typeof data.matches
  runFullRecalc()
}

// ---------- 清除歷史紀錄 ----------

/**
 * 為「全體球員」固化清除前的目前狀態，供之後 recalcAll 重播還原（保留強度分數用）。
 * 必須全員固化：只固化參與者會讓其他場次交手過的第三方在重算時被連動改分。
 * 代價是基準前的比賽視為已結算——之後修改早於基準的比分不再影響強度（UI 有標示）。
 */
function baselineAllPlayers() {
  const now = Date.now()
  for (const p of data.players) {
    data.baselines.push({
      id: genId(),
      playerId: p.id,
      rating: p.rating,
      rd: p.rd,
      vol: p.vol,
      at: now,
    })
  }
}

/** 最新的固化基準時間點；早於此時間的比賽修改不再影響強度分數 */
export const latestBaselineAt = computed(() =>
  data.baselines.reduce((max, b) => Math.max(max, b.at), 0),
)

/** 清除單一場次的比賽紀錄。已結束場次連場次一併刪除；進行中場次僅刪 matches，保留場次與出席名單。 */
export function clearSession(sessionId: string, resetRatings: boolean) {
  if (!writesAllowed()) return
  const session = data.sessions.find((s) => s.id === sessionId)
  if (!session) return

  if (!resetRatings) baselineAllPlayers()

  data.matches = data.matches.filter((m) => m.sessionId !== sessionId) as typeof data.matches
  if (!session.active) {
    data.sessions = data.sessions.filter((s) => s.id !== sessionId) as typeof data.sessions
  }
  runFullRecalc()
}

/** 清除全部歷史紀錄：所有比賽紀錄與已結束場次刪除；進行中場次保留（統計歸零）。 */
export function clearAllHistory(resetRatings: boolean) {
  if (!writesAllowed()) return
  if (!resetRatings) baselineAllPlayers()

  data.matches = [] as typeof data.matches
  data.sessions = data.sessions.filter((s) => s.active) as typeof data.sessions
  runFullRecalc()
}

// ---------- CSV ----------

export function exportCsvText(): string {
  return exportCsv(data)
}

/** 觸發下載目前資料的 CSV 備份（參賽者頁「匯出 CSV」與清除歷史 modal「先匯出 CSV 備份」共用） */
export function downloadCsvBackup() {
  const csv = exportCsvText()
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  a.href = url
  a.download = `badminton-matcher-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** 覆蓋還原；格式錯誤時 throw */
export function importCsvText(text: string) {
  if (!writesAllowed()) return
  const parsed = importCsv(text)
  data.players = parsed.players as typeof data.players
  data.sessions = parsed.sessions as typeof data.sessions
  data.matches = parsed.matches as typeof data.matches
  data.overrides = parsed.overrides as typeof data.overrides
  data.baselines = parsed.baselines as typeof data.baselines
  ui.pending = null
  ui.live = null
  ui.scoring = false
}

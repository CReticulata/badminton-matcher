/**
 * 全域 store：Vue reactivity + localStorage 持久化。
 */
import { computed, reactive, ref, watch } from 'vue'
import type {
  AppData, Match, MatchContext, Mode, Player, RoundProposal,
  ScoringFormatSnapshot, Session,
} from './types'
import {
  DEFAULT_RD,
  DEFAULT_VOL,
  OVERRIDE_RD,
  applyMatch,
  countsForRating,
  recalcAll,
  replayRatings,
  type GlickoState,
} from './lib/glicko2'
import {
  applyRotationWildcard,
  consecutivePlayCounts,
  generateRound,
  type Candidate,
} from './lib/matchmaking'
import { nextDefaultColor } from './lib/color'
import { exportCsv, importCsv } from './lib/csv'
import { sessionRatingReport } from './lib/rating-history'
import { migrateAppData } from './lib/migration'
import { normalizeAppData } from './lib/app-data-normalization'
import {
  STORAGE_KEY,
  ensurePreFormatBackup,
  loadPersisted,
} from './lib/persistence'
import { cloneScoringFormat, isLegalEndpoint, isStructured } from './lib/scoring-format'
import { levelToRating } from './lib/level'
import { projectRotationState } from './lib/rotation-fairness'
import { allocateCompletionSequence, orderMatchesByCompletionSequence } from './lib/rotation-chronology'
import { cloneValidatedRotationWildcardLineage, validatedRotationWildcardLineage } from './lib/rotation-wildcard-lineage'
import { ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD } from './lib/rotation-wildcard-release'
import {
  assertIncrementableCausalTimestamp,
  assertSafeCausalTimestamp,
  nextSafeCausalTimestamp,
} from './lib/causal-time'

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
  rating: Math.round(levelToRating(index + 1)),
}))

const storage = (): Storage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage

const outcome = loadPersisted(storage())

/**
 * 復原狀態：blocked 代表本機資料讀不懂但已原樣保留，此時停用自動儲存與所有變更指令。
 * 與 persistenceError（載入成功但寫入失敗）刻意分開——兩者要使用者做的事不同。
 */
export const recoveryState = ref<
  { status: 'ready' } | { status: 'blocked'; raw: string; message: string }
>(outcome.status === 'ready' ? { status: 'ready' } : { status: 'blocked', raw: outcome.raw, message: outcome.message })

/** 舊格式原始值；首次寫入含賽制欄位的資料前需先備份 */
let preFormatRaw: string | null = outcome.status === 'ready' ? outcome.raw : null

export const data = reactive<AppData>(
  outcome.status === 'ready'
    ? outcome.data
    : { players: [], sessions: [], matches: [], overrides: [], baselines: [] },
)

export const persistenceError = ref<string | null>(null)

export function persistData(): boolean {
  const store = storage()
  if (!store) return true
  if (recoveryState.value.status === 'blocked') return false
  if (!ensurePreFormatBackup(store, preFormatRaw)) {
    persistenceError.value = '無法建立舊格式備份，資料尚未儲存到此裝置。請先匯出 CSV 備份。'
    return false
  }
  preFormatRaw = null
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data))
    persistenceError.value = null
    return true
  } catch {
    persistenceError.value = '資料尚未儲存到此裝置，請先匯出 CSV 備份並釋放瀏覽器儲存空間。'
    return false
  }
}

watch(
  data,
  () => {
    if (recoveryState.value.status === 'blocked') return
    persistData()
  },
  { deep: true },
)

// A successful legacy migration must become a stable, one-time boundary before
// the user performs another action. The existing backup gate still runs first;
// if it cannot write safely, persistenceError remains visible and old bytes stay intact.
if (outcome.status === 'ready' && outcome.migrated) persistData()

export const BLOCKED_MESSAGE = '本機資料尚未復原，請先完成復原流程再繼續'

/**
 * blocked 期間任何會變更資料的指令都不可用。
 * 只擋在 UI 層是不夠的——那讓「資料不被動到」取決於畫面剛好沒有入口，
 * 之後新增入口或重構就會無聲失效。復原流程本身（importCsvText／discardBlockedData）除外。
 */
function isBlocked(): boolean {
  return recoveryState.value.status === 'blocked'
}

/** 復原：捨棄讀不懂的本機資料並從空白開始（呼叫端負責取得明確確認） */
export function discardBlockedData() {
  if (recoveryState.value.status !== 'blocked') return
  const store = storage()
  if (store) ensurePreFormatBackup(store, recoveryState.value.raw)
  preFormatRaw = null
  data.players = [] as typeof data.players
  data.sessions = [] as typeof data.sessions
  data.matches = [] as typeof data.matches
  data.overrides = [] as typeof data.overrides
  data.baselines = [] as typeof data.baselines
  recoveryState.value = { status: 'ready' }
  persistData()
}

/** UI 流程狀態（不持久化） */
export const ui = reactive<{
  view: 'session' | 'players' | 'history'
  /** 待確認的分組（分組預覽）；含開打前可更換的賽制 */
  pending: MatchContext | null
  /** 進行中的比賽（對戰顯示畫面）；賽制已凍結 */
  live: MatchContext | null
  /** 顯示比分輸入 */
  scoring: boolean
  mode: Mode
}>({
  view: 'session',
  pending: null,
  live: outcome.status === 'ready'
    ? outcome.data.sessions.find((session) => session.active)?.liveMatch ?? null
    : null,
  scoring: false,
  mode: 'doubles',
})

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function causalSessionTime(session: Session, strictlyAfterCompletedMatches: boolean): number {
  const hasCompletedMatch = data.matches.some((match) => match.sessionId === session.id)
  const runtimeFloor = strictlyAfterCompletedMatches && hasCompletedMatch
    ? nextSafeCausalTimestamp(fairnessEvaluationTime.value, 'fairness runtime')
    : fairnessEvaluationTime.value
  return assertSafeCausalTimestamp(Math.max(Date.now(), runtimeFloor), 'trusted fairness runtime')
}

function recoverySupersessionTime(session: Session): number {
  const latestPersistedEventAt = (session.attendanceEvents ?? []).reduce(
    (latest, event) => Math.max(latest, event.at),
    Number.NEGATIVE_INFINITY,
  )
  const eventFloor = Number.isFinite(latestPersistedEventAt)
    ? nextSafeCausalTimestamp(latestPersistedEventAt, 'persisted attendance')
    : latestPersistedEventAt
  const latestPersistedMatchAt = data.matches.reduce(
    (latest, match) => match.sessionId === session.id ? Math.max(latest, match.at) : latest,
    Number.NEGATIVE_INFINITY,
  )
  const matchFloor = Number.isFinite(latestPersistedMatchAt)
    ? nextSafeCausalTimestamp(latestPersistedMatchAt, 'persisted match')
    : latestPersistedMatchAt
  return Math.max(causalSessionTime(session, true), eventFloor, matchFloor)
}

function appendAttendance(
  session: Session,
  kind: import('./types').AttendanceEvent['kind'],
  playerId?: string,
  extra: Partial<import('./types').AttendanceEvent> = {},
  timing: 'trusted' | 'recovery' = 'trusted',
) {
  const events = session.attendanceEvents ?? (session.attendanceEvents = [])
  const sequence = events.reduce((max, event) => Math.max(max, event.sequence), -1) + 1
  // Attendance after a completed match must sort strictly after that match even
  // when both actions happen inside one wall-clock millisecond. Recovery uses
  // this causal boundary to exclude corrupted prefix lineage without weakening
  // fail-closed validation for post-boundary matches.
  const at = timing === 'recovery'
    ? recoverySupersessionTime(session)
    : causalSessionTime(session, true)
  events.push({ id: genId(), sessionId: session.id, kind, playerId, at, sequence, ...extra })
  fairnessEvaluationTime.value = at
}

function clearPendingForEligibility() { ui.pending = null }
const isLivePlayer = (playerId: string) => !!ui.live && [...ui.live.teamA, ...ui.live.teamB].includes(playerId)

/** Resolve only reset requests owned by this durable live-match boundary. */
function resolveQueuedResets(session: Session, liveMatchId: string | undefined) {
  if (!liveMatchId) return
  const requests = [...(session.attendanceEvents ?? [])]
  const repair = requests.find((event) => event.kind === 'fairness-recovery-boundary' && event.liveMatchId === liveMatchId)
  if (repair) {
    appendAttendance(session, 'fairness-recovery-boundary', undefined, {
      presentIds: [...session.presentIds],
      volunteerRestIds: [...session.volunteerRest],
    }, 'recovery')
    for (const playerId of session.presentIds) appendAttendance(session, 'fairness-period-started', playerId)
    return
  }
  for (const request of requests) {
    if (request.kind === 'fairness-reset-requested' && request.liveMatchId === liveMatchId) {
      appendAttendance(session, 'fairness-period-started', request.playerId)
    }
  }
}

export function resetFairnessPeriod(playerId: string) {
  if (isBlocked()) return
  const session = currentSession.value
  if (!session || !session.presentIds.includes(playerId)) return
  const live = ui.live
  if (live && [...live.teamA, ...live.teamB].includes(playerId)) {
    if (!(session.attendanceEvents ?? []).some((event) => event.kind === 'fairness-reset-requested' && event.playerId === playerId && event.liveMatchId === live.liveMatchId)) {
      appendAttendance(session, 'fairness-reset-requested', playerId, { liveMatchId: live.liveMatchId })
    }
    return
  }
  appendAttendance(session, 'fairness-period-started', playerId)
  clearPendingForEligibility()
}

export function repairFairness(): boolean {
  if (isBlocked()) return false
  const session = currentSession.value
  if (!session) return false
  if (ui.live) {
    const liveMatchId = ui.live.liveMatchId
    if (!liveMatchId) return false
    if (!(session.attendanceEvents ?? []).some((event) => event.kind === 'fairness-recovery-boundary' && event.liveMatchId === liveMatchId)) {
      appendAttendance(session, 'fairness-recovery-boundary', undefined, {
        liveMatchId,
        presentIds: [...session.presentIds],
        volunteerRestIds: [...session.volunteerRest],
      })
    }
    return true
  }
  appendAttendance(session, 'fairness-recovery-boundary', undefined, {
    presentIds: [...session.presentIds],
    volunteerRestIds: [...session.volunteerRest],
  }, 'recovery')
  for (const playerId of session.presentIds) appendAttendance(session, 'fairness-period-started', playerId)
  clearPendingForEligibility()
  refreshFairnessNow()
  return true
}

export const currentSession = computed<Session | null>(
  () => data.sessions.find((s) => s.active) ?? null,
)

export const playerById = computed(() => {
  const m = new Map<string, Player>()
  for (const p of data.players) m.set(p.id, p)
  return m
})

export const activePlayers = computed(() => data.players.filter((player) => player.archivedAt === undefined))
export const archivedPlayers = computed(() => data.players.filter((player) => player.archivedAt !== undefined))

const currentSessionMatches = computed(() => {
  const sessionId = currentSession.value?.id
  if (!sessionId) return []
  return data.matches.filter((match) => match.sessionId === sessionId)
})

/** A UI-owned minute tick refreshes this derived view; elapsed time is never persisted. */
export const fairnessEvaluationTime = ref(
  assertIncrementableCausalTimestamp(Date.now(), 'initial fairness runtime'),
)
export function refreshFairnessNow() {
  const current = assertIncrementableCausalTimestamp(fairnessEvaluationTime.value, 'current fairness runtime')
  const wallClock = assertIncrementableCausalTimestamp(Date.now(), 'fairness refresh')
  fairnessEvaluationTime.value = Math.max(current, wallClock)
}
export const fairnessProjection = computed(() => {
  const session = currentSession.value
  return session ? projectRotationState(session, session.attendanceEvents ?? [], currentSessionMatches.value, fairnessEvaluationTime.value) : null
})

export type RotationWildcardState =
  | { status: 'inactive'; remaining: 0 }
  | { status: 'ready'; remaining: 0 }
  | { status: 'cooldown'; remaining: 1 | 2 }
  | { status: 'paused'; reason: 'fairness-degraded'; detail: string; remaining: 0 | 1 | 2 }

export const rotationWildcardState = computed<RotationWildcardState>(() => {
  const session = currentSession.value
  if (!session) return { status: 'inactive', remaining: 0 }
  const remaining = Math.max(0, Math.min(2, session.rotationWildcardCooldownRemaining ?? 0)) as 0 | 1 | 2
  const projection = fairnessProjection.value
  if (projection?.status === 'degraded') {
    return {
      status: 'paused',
      reason: 'fairness-degraded',
      detail: projection.reason,
      remaining,
    }
  }
  return remaining === 0
    ? { status: 'ready', remaining: 0 }
    : { status: 'cooldown', remaining }
})

export const ratingReportsBySession = computed(() => {
  const reports = new Map<string, NonNullable<ReturnType<typeof sessionRatingReport>>>()
  for (const session of data.sessions) {
    const report = sessionRatingReport(session, data.matches, data.overrides, data.baselines)
    if (report) reports.set(session.id, report)
  }
  return reports
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
  const get = (id: string) => {
    let s = stats.get(id)
    if (!s) {
      s = { played: 0, rested: 0 }
      stats.set(id, s)
    }
    return s
  }
  for (const m of currentSessionMatches.value) {
    for (const id of [...m.teamA, ...m.teamB]) get(id).played++
    for (const id of m.resters) get(id).rested++
  }
  return stats
})

// ---------- 參賽者 ----------

export function addPlayer(name: string, initialRating: number): Player {
  if (isBlocked()) throw new Error(BLOCKED_MESSAGE)
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
  const session = currentSession.value
  if (session) {
    session.openingRatings ??= {}
    session.openingRatings[p.id] = { rating: p.rating, rd: p.rd, vol: p.vol }
    session.addedDuringSessionIds ??= []
    session.addedDuringSessionIds.push(p.id)
  }
  return p
}

export function renamePlayer(id: string, name: string) {
  if (isBlocked()) return
  const p = playerById.value.get(id)
  if (p && name.trim()) p.name = name.trim()
}

export function setPlayerColor(id: string, color: string) {
  if (isBlocked()) return
  const p = playerById.value.get(id)
  if (p) p.color = color
}

/** 手動覆寫 rating：RD 重設為高值，並記錄事件供全量重算重播 */
export function overrideRating(id: string, rating: number): boolean {
  if (isBlocked()) return false
  if (currentSession.value) return false
  const p = playerById.value.get(id)
  if (!p) return false
  data.overrides.push({ id: genId(), playerId: id, rating, at: Date.now() })
  p.rating = rating
  p.rd = OVERRIDE_RD
  p.vol = DEFAULT_VOL
  return true
}

export function archivePlayer(id: string): boolean {
  if (isBlocked()) return false
  if (currentSession.value) return false
  const player = playerById.value.get(id)
  if (!player || player.archivedAt) return false
  player.archivedAt = Date.now()
  return true
}

export function restorePlayer(id: string): boolean {
  if (isBlocked()) return false
  const p = data.players.find((player) => player.id === id)
  if (!p || p.archivedAt === undefined) return false
  delete p.archivedAt
  return true
}

/** @deprecated 刪除已改為可還原的封存；保留給既有呼叫端相容。 */
export const removePlayer = archivePlayer

// ---------- 場次 ----------

export function startSession(presentIds: string[], defaultScoringFormat: ScoringFormatSnapshot) {
  if (isBlocked()) return
  const startedAt = assertIncrementableCausalTimestamp(Date.now(), 'session start')
  const now = new Date(startedAt)
  // Replacing an active activity is also a live-match cancellation boundary.
  if (currentSession.value) endSession()
  for (const s of data.sessions) s.active = false
  const id = genId()
  const attendanceEvents = presentIds.flatMap((playerId, index) => [
    { id: genId(), sessionId: id, kind: 'join' as const, playerId, at: startedAt, sequence: index * 2 },
    { id: genId(), sessionId: id, kind: 'fairness-period-started' as const, playerId, at: startedAt, sequence: index * 2 + 1 },
  ])
  data.sessions.push({
    id,
    name: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 場次`,
    startedAt,
    nextCompletionSequence: 1,
    rotationWildcardCooldownRemaining: 0,
    openingRatings: Object.fromEntries(
      data.players.map((player) => [
        player.id,
        { rating: player.rating, rd: player.rd, vol: player.vol },
      ]),
    ),
    participantIds: [...presentIds],
    addedDuringSessionIds: [],
    presentIds: [...presentIds],
    leftIds: [],
    volunteerRest: [],
    active: true,
    defaultScoringFormat: cloneScoringFormat(defaultScoringFormat),
    attendanceEvents,
  })
  fairnessEvaluationTime.value = startedAt
  ui.pending = null
  ui.live = null
}

/** 變更活動預設賽制；只影響尚未開打的比賽，既有 live／已完成快照不受影響 */
export function setSessionDefaultScoringFormat(snapshot: ScoringFormatSnapshot) {
  if (isBlocked()) return
  const s = currentSession.value
  if (!s) return
  s.defaultScoringFormat = cloneScoringFormat(snapshot)
  if (ui.pending) ui.pending = { ...ui.pending, scoringFormat: cloneScoringFormat(snapshot) }
}

/** 開打前覆寫本場賽制；不改動活動預設 */
export function setPendingScoringFormat(snapshot: ScoringFormatSnapshot) {
  if (isBlocked()) return
  if (!ui.pending) return
  ui.pending = { ...ui.pending, scoringFormat: cloneScoringFormat(snapshot) }
}

export function endSession() {
  if (isBlocked()) return
  const s = currentSession.value
  if (!s) {
    cancelLiveMatch()
    ui.pending = null
    ui.scoring = false
    return
  }
  const endedAt = causalSessionTime(s, false)
  if (endedAt < s.startedAt) throw new Error('Session end cannot precede its start')
  if (data.matches.some((match) => match.sessionId === s.id && match.at > endedAt)) {
    throw new Error('Session end cannot precede a persisted completed match')
  }
  // Ending is a cancellation boundary for a recoverable live match.
  cancelLiveMatch()
  s.active = false
  s.endedAt = endedAt
  ui.pending = null
  ui.scoring = false
}

export function joinSession(playerId: string) {
  if (isBlocked()) return
  const s = currentSession.value
  if (!s || s.presentIds.includes(playerId)) return
  s.participantIds ??= [...s.presentIds, ...s.leftIds]
  if (!s.participantIds.includes(playerId)) s.participantIds.push(playerId)
  if (!s.presentIds.includes(playerId)) s.presentIds.push(playerId)
  s.leftIds = s.leftIds.filter((x) => x !== playerId)
  appendAttendance(s, 'join', playerId)
  // A first late join starts its own fairness period; a rejoin resumes it.
  if (!(s.attendanceEvents ?? []).some((event) => event.playerId === playerId && event.kind === 'fairness-period-started')) {
    appendAttendance(s, 'fairness-period-started', playerId)
  }
  clearPendingForEligibility()
}

export function leaveSession(playerId: string) {
  if (isBlocked()) return
  const s = currentSession.value
  if (!s || !s.presentIds.includes(playerId) || isLivePlayer(playerId)) return
  s.presentIds = s.presentIds.filter((x) => x !== playerId)
  s.volunteerRest = s.volunteerRest.filter((x) => x !== playerId)
  if (!s.leftIds.includes(playerId)) s.leftIds.push(playerId)
  appendAttendance(s, 'leave', playerId)
  clearPendingForEligibility()
}

export function toggleVolunteerRest(playerId: string) {
  if (isBlocked()) return
  const s = currentSession.value
  if (!s || !s.presentIds.includes(playerId) || isLivePlayer(playerId)) return
  if (s.volunteerRest.includes(playerId)) {
    s.volunteerRest = s.volunteerRest.filter((x) => x !== playerId)
    appendAttendance(s, 'voluntary-rest-end', playerId)
  } else {
    s.volunteerRest.push(playerId)
    appendAttendance(s, 'voluntary-rest-start', playerId)
  }
  clearPendingForEligibility()
}

// ---------- 分組 ----------

function candidates(): Candidate[] {
  const s = currentSession.value
  if (!s) return []
  const stats = sessionStats.value
  const projection = projectRotationState(
    s,
    s.attendanceEvents ?? [],
    currentSessionMatches.value,
    causalSessionTime(s, false),
  )
  const projected = projection.status === 'valid' ? projection.participantStates : undefined
  const consecutiveCounts = consecutivePlayCounts(currentSessionMatches.value)
  if (projected) {
    return Object.entries(projected)
      .filter(([, state]) => state.present)
      .map(([id, state]) => {
        const p = playerById.value.get(id)
        return {
          id,
          playCount: stats.get(id)?.played ?? 0,
          ratePerHour: state.ratePerHour,
          consecutivePlayCount: consecutiveCounts.get(id) ?? 0,
          rating: p?.rating ?? 1500,
          volunteerRest: state.volunteerRest,
        }
      })
  }
  return s.presentIds.map((id) => {
    const p = playerById.value.get(id)
    return {
      id,
      playCount: stats.get(id)?.played ?? 0,
      consecutivePlayCount: consecutiveCounts.get(id) ?? 0,
      rating: p?.rating ?? 1500,
      volunteerRest: s.volunteerRest.includes(id),
    }
  })
}

/** 產生下一場分組（進入預覽）；人數不足回傳 false */
export function proposeRound(): boolean {
  if (isBlocked()) return false
  const session = currentSession.value
  if (!session) return false
  const roster = candidates()
  const normalProposal: RoundProposal | null = generateRound(roster, ui.mode)
  if (!normalProposal) return false
  const projection = projectRotationState(
    session,
    session.attendanceEvents ?? [],
    currentSessionMatches.value,
    causalSessionTime(session, false),
  )
  const completedPlayingSets = currentSessionMatches.value.length === 0
    ? []
    : orderMatchesByCompletionSequence(currentSessionMatches.value, session.id)
      .map((match) => [...match.teamA, ...match.teamB])
  const proposal = ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD
    ? (() => {
      const productionReleaseMarker = 'rotation-wildcard-generation-release-v1'
      const proposal = applyRotationWildcard({
        normalProposal,
        candidates: roster,
        completedPlayingSets,
        cooldownRemaining: session.rotationWildcardCooldownRemaining ?? 0,
        fairnessReliable: projection.status === 'valid',
        rng: Math.random,
      })
      Object.defineProperty(proposal, Symbol.for(productionReleaseMarker), {
        value: true,
        enumerable: false,
      })
      return proposal
    })()
    : normalProposal
  ui.pending = { ...proposal, scoringFormat: cloneScoringFormat(session.defaultScoringFormat) }
  return true
}

/** 分組預覽中：交換兩人位置（隊伍 A/B/休息名單皆可） */
export function swapInPending(idA: string, idB: string) {
  if (isBlocked()) return
  const p = ui.pending
  if (!p || idA === idB) return
  const lists = [p.teamA, p.teamB, p.resters]
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
  if (p.rotationWildcard && !validatedRotationWildcardLineage(p)) {
    delete p.rotationWildcard
  }
}

/** 開打：把選定的賽制凍結進 live context，此後不可更換 */
export function startMatch() {
  if (isBlocked()) return
  if (!ui.pending) return
  const session = currentSession.value
  if (!session) return
  const projection = projectRotationState(
    session,
    session.attendanceEvents ?? [],
    currentSessionMatches.value,
    causalSessionTime(session, false),
  )
  const ids = projection?.status === 'valid'
    ? Object.fromEntries([...ui.pending.teamA, ...ui.pending.teamB].flatMap((id) => projection.participantStates[id]?.periodId ? [[id, projection.participantStates[id]!.periodId!]] : []))
    : undefined
  const rotationWildcard = cloneValidatedRotationWildcardLineage(ui.pending)
  const { rotationWildcard: _unvalidated, ...pending } = ui.pending
  const startedAt = causalSessionTime(session, false)
  fairnessEvaluationTime.value = Math.max(fairnessEvaluationTime.value, startedAt)
  ui.live = {
    ...pending,
    liveMatchId: genId(),
    startedAt,
    scoringFormat: cloneScoringFormat(ui.pending.scoringFormat),
    fairnessPeriodIds: ids,
    ...(rotationWildcard ? { rotationWildcard } : {}),
  }
  session.liveMatch = ui.live
  ui.pending = null
}

export function cancelPending() {
  if (isBlocked()) return
  ui.pending = null
}

/**
 * 取消進行中的比賽：整場作廢，不寫入任何紀錄。
 * 開打本身不產生持久化狀態（上場／休息次數皆由 matches 推導），
 * 因此丟掉 live context 即可，rating 與統計不受影響。
 */
export function cancelLiveMatch() {
  if (isBlocked()) return
  const session = currentSession.value
  const live = ui.live ?? session?.liveMatch ?? null
  if (session) {
    resolveQueuedResets(session, live?.liveMatchId)
    delete session.liveMatch
  }
  ui.live = null
  ui.scoring = false
}

/** 強制記錄選項：略過賽制檢查並將該場排除於強度計算之外 */
export interface RecordOptions {
  /** 比分不符賽制時仍要記錄；該場不計入強度，但仍計入上場／休息次數 */
  forceUnrated?: boolean
}

/**
 * 終局比分驗證。結構化賽制套用凍結的規則；unknown 維持既有寬鬆規則（不等的非負整數）。
 * 回傳錯誤訊息或 null；必須在寫入紀錄與任何 rating 變更之前呼叫。
 *
 * forceUnrated 只放行「賽制」這一關。非負整數與不可平手是所有紀錄的共同前提：
 * 平手沒有勝負方，對戰畫面與歷史都無法呈現，強制記錄也不例外。
 */
function validateEndpoint(
  snapshot: ScoringFormatSnapshot,
  scoreA: number,
  scoreB: number,
  options: RecordOptions = {},
): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return '比分必須是非負整數'
  }
  if (scoreA === scoreB) return '比分不可平手'
  if (options.forceUnrated) return null
  if (isStructured(snapshot) && !isLegalEndpoint(snapshot, scoreA, scoreB)) {
    const { target, winBy, cap } = snapshot.rules
    return `比分不符合本場賽制（${target} 分制、領先 ${winBy} 分、上限 ${cap} 分）`
  }
  return null
}

/** 比分是否需要以「不計入強度」的方式記錄 */
function needsExclusion(snapshot: ScoringFormatSnapshot, scoreA: number, scoreB: number): boolean {
  return isStructured(snapshot) && !isLegalEndpoint(snapshot, scoreA, scoreB)
}

/** 賽後輸入比分：寫入紀錄、依實際分組更新 rating 與統計 */
export function submitScore(
  scoreA: number,
  scoreB: number,
  options: RecordOptions = {},
): string | null {
  if (isBlocked()) return BLOCKED_MESSAGE
  const live = ui.live
  const sess = currentSession.value
  if (!live || !sess) return '沒有進行中的比賽'
  const formatError = validateEndpoint(live.scoringFormat, scoreA, scoreB, options)
  if (formatError) return formatError
  const excluded = needsExclusion(live.scoringFormat, scoreA, scoreB)
  const rotationWildcard = cloneValidatedRotationWildcardLineage(live)
  const causalCompletionAt = causalSessionTime(sess, false)
  const completedAt = live.startedAt === undefined
    ? causalCompletionAt
    : Math.max(causalCompletionAt, live.startedAt)

  const match: Match = {
    id: genId(),
    sessionId: sess.id,
    at: completedAt,
    completionSequence: allocateCompletionSequence(sess),
    mode: live.mode,
    teamA: [...live.teamA],
    teamB: [...live.teamB],
    scoreA,
    scoreB,
    resters: [...live.resters],
    scoringFormat: cloneScoringFormat(live.scoringFormat),
    fairnessPeriodIds: live.fairnessPeriodIds,
    ...(rotationWildcard ? { rotationWildcard } : {}),
  }
  if (excluded) match.excludedFromRating = true
  data.matches.push(match)
  fairnessEvaluationTime.value = Math.max(fairnessEvaluationTime.value, completedAt)

  // 即時 Glicko-2 更新（一場＝一個 rating period）；不計入強度者跳過
  if (countsForRating(match)) {
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
  }

  // Cooldown is an independent forward-only completion transition. A valid wildcard
  // completion starts it even if fairness degraded after match start; ordinary
  // completions decrement only while the existing fairness replay is reliable.
  if (rotationWildcard) {
    sess.rotationWildcardCooldownRemaining = 2
  } else {
    const projection = projectRotationState(
      sess,
      sess.attendanceEvents ?? [],
      currentSessionMatches.value,
      completedAt,
    )
    if (
      projection.status === 'valid' &&
      (sess.rotationWildcardCooldownRemaining ?? 0) > 0
    ) {
      sess.rotationWildcardCooldownRemaining!--
    }
  }

  resolveQueuedResets(sess, live.liveMatchId)
  delete sess.liveMatch
  ui.live = null
  ui.scoring = false
  return null
}

// ---------- 歷史修改（全量重算） ----------

function applyRatingStates(states: ReadonlyMap<string, GlickoState>) {
  for (const player of data.players) {
    const state = states.get(player.id)
    if (!state) continue
    player.rating = state.rating
    player.rd = state.rd
    player.vol = state.vol
  }
}

function runFullRecalc() {
  // startedAt 相同時以陣列位置為準（sessions 依建立順序 append，越後面越新）
  const latestSession = data.sessions
    .filter((session) => ratingReportsBySession.value.has(session.id))
    .reduce<Session | undefined>(
      (latest, session) => (!latest || session.startedAt >= latest.startedAt ? session : latest),
      undefined,
    )
  if (latestSession) {
    const report = ratingReportsBySession.value.get(latestSession.id)!
    const sessionMatches = data.matches.filter((match) => match.sessionId === latestSession.id)
    const boundaryAt =
      latestSession.endedAt ??
      Math.max(latestSession.startedAt, ...sessionMatches.map((match) => match.at))
    // 較舊場次的比賽已包含在最新活動的 openingRatings 內，不可依時間戳重播
    // （同一毫秒時 at >= boundaryAt 會誤把前一活動的比賽再套用一次）
    const sessionRank = new Map(data.sessions.map((session, index) => [session.id, index]))
    const latestRank = sessionRank.get(latestSession.id)!
    const afterLatestSession = (match: Match): boolean => {
      const rank = sessionRank.get(match.sessionId)
      if (rank === undefined) return match.at >= boundaryAt
      const session = data.sessions[rank]!
      return (
        session.startedAt > latestSession.startedAt ||
        (session.startedAt === latestSession.startedAt && rank > latestRank)
      )
    }
    const states = replayRatings(
      report.endingStates,
      data.matches.filter(
        (match) => match.sessionId !== latestSession.id && afterLatestSession(match),
      ),
      data.overrides.filter((override) => override.at >= boundaryAt),
      data.baselines.filter((baseline) => baseline.at >= boundaryAt),
    )
    applyRatingStates(states)
    return
  }
  const states = recalcAll(data.players, data.matches, data.overrides, data.baselines)
  applyRatingStates(states)
}

export function editMatchScore(
  matchId: string,
  scoreA: number,
  scoreB: number,
  options: RecordOptions = {},
): string | null {
  if (isBlocked()) return BLOCKED_MESSAGE
  const m = data.matches.find((x) => x.id === matchId)
  if (!m) return '找不到這場比賽'
  // 驗證位於重播決策的上游：只會擋下修改，不影響哪些事件重播或邊界在哪
  // 已經不計入強度者無需再次確認：那場本來就不影響任何人的分數，
  // 再問一次沒有安全性收益。要守的是「不能不小心把計分的比賽變成不計分」，
  // 所以只有從計入轉為排除時才要求明確強制。
  const alreadyExcluded = m.excludedFromRating === true
  const formatError = validateEndpoint(m.scoringFormat, scoreA, scoreB, {
    forceUnrated: options.forceUnrated || alreadyExcluded,
  })
  if (formatError) return formatError
  // 不變式：一場比賽被排除於強度計算，當且僅當其比分不符合凍結的賽制。
  // 因此把不合法的比分改正後會自動恢復計入，改成另一個不合法比分則維持排除。
  if (needsExclusion(m.scoringFormat, scoreA, scoreB)) m.excludedFromRating = true
  else delete m.excludedFromRating
  m.scoreA = scoreA
  m.scoreB = scoreB
  runFullRecalc()
  return null
}

export function deleteMatch(matchId: string) {
  if (isBlocked()) return
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
  if (isBlocked()) return
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
  if (isBlocked()) return
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

/**
 * 覆蓋還原；格式錯誤時 throw。
 * 解析與正規化全部成功後才取代資料——失敗時目前資料與 blocked 狀態都不動。
 * 這也是復原流程的還原路徑：成功後才解除封鎖並重新啟用自動儲存。
 */
export interface CsvCheckpointPreview {
  activeSessionName?: string
  activeCooldownRemaining?: number
  nextCompletionSequence?: number
}

/** Parse and fully validate a CSV checkpoint without mutating current state. */
export function inspectCsvText(text: string): CsvCheckpointPreview {
  const imported = migrateAppData(normalizeAppData(importCsv(text)))
  const active = imported.sessions.find((session) => session.active)
  return active ? {
    activeSessionName: active.name,
    activeCooldownRemaining: active.rotationWildcardCooldownRemaining ?? 0,
    nextCompletionSequence: active.nextCompletionSequence,
  } : {}
}

export function importCsvText(text: string) {
  const parsed = migrateAppData(normalizeAppData(importCsv(text)))
  const importedRuntime = assertIncrementableCausalTimestamp(Date.now(), 'CSV import fairness runtime')
  const blocked = recoveryState.value.status === 'blocked' ? recoveryState.value.raw : null
  data.players = parsed.players as typeof data.players
  data.sessions = parsed.sessions as typeof data.sessions
  data.matches = parsed.matches as typeof data.matches
  data.overrides = parsed.overrides as typeof data.overrides
  data.baselines = parsed.baselines as typeof data.baselines
  fairnessEvaluationTime.value = importedRuntime
  ui.pending = null
  ui.live = parsed.sessions.find((session) => session.active)?.liveMatch ?? null
  ui.scoring = false
  if (blocked !== null) {
    // 先保留讀不懂的原始值，再解除封鎖並寫入還原後的資料
    ensurePreFormatBackup(storage(), blocked)
    preFormatRaw = null
    recoveryState.value = { status: 'ready' }
    persistData()
  }
}

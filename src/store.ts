/**
 * 全域 store：Vue reactivity + localStorage 持久化。
 */
import { computed, reactive, watch } from 'vue'
import type { AppData, Match, Mode, Player, RoundProposal, Session } from './types'
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

const STORAGE_KEY = 'badminton-matcher:v1'

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

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      return {
        players: d.players ?? [],
        sessions: d.sessions ?? [],
        matches: d.matches ?? [],
        overrides: d.overrides ?? [],
        baselines: d.baselines ?? [],
      }
    }
  } catch {
    /* 壞資料視為空 */
  }
  return { players: [], sessions: [], matches: [], overrides: [], baselines: [] }
}

export const data = reactive<AppData>(loadData())

watch(
  data,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* 空間不足等錯誤：忽略，資料量極小不太可能發生 */
    }
  },
  { deep: true },
)

/** UI 流程狀態（不持久化） */
export const ui = reactive<{
  view: 'session' | 'players' | 'history'
  /** 待確認的分組（分組預覽） */
  pending: RoundProposal | null
  /** 進行中的比賽（對戰顯示畫面） */
  live: RoundProposal | null
  /** 顯示比分輸入 */
  scoring: boolean
  mode: Mode
}>({ view: 'session', pending: null, live: null, scoring: false, mode: 'doubles' })

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

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
  const p = playerById.value.get(id)
  if (p && name.trim()) p.name = name.trim()
}

export function setPlayerColor(id: string, color: string) {
  const p = playerById.value.get(id)
  if (p) p.color = color
}

/** 手動覆寫 rating：RD 重設為高值，並記錄事件供全量重算重播 */
export function overrideRating(id: string, rating: number) {
  const p = playerById.value.get(id)
  if (!p) return
  data.overrides.push({ id: genId(), playerId: id, rating, at: Date.now() })
  p.rating = rating
  p.rd = OVERRIDE_RD
  p.vol = DEFAULT_VOL
}

/** 僅允許刪除沒有任何比賽紀錄的人 */
export function removePlayer(id: string): boolean {
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

export function startSession(presentIds: string[]) {
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
  })
  ui.pending = null
  ui.live = null
}

export function endSession() {
  const s = currentSession.value
  if (s) s.active = false
  ui.pending = null
  ui.live = null
  ui.scoring = false
}

export function joinSession(playerId: string) {
  const s = currentSession.value
  if (!s) return
  if (!s.presentIds.includes(playerId)) s.presentIds.push(playerId)
  s.leftIds = s.leftIds.filter((x) => x !== playerId)
}

export function leaveSession(playerId: string) {
  const s = currentSession.value
  if (!s) return
  s.presentIds = s.presentIds.filter((x) => x !== playerId)
  s.volunteerRest = s.volunteerRest.filter((x) => x !== playerId)
  if (!s.leftIds.includes(playerId)) s.leftIds.push(playerId)
}

export function toggleVolunteerRest(playerId: string) {
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

/** 產生下一場分組（進入預覽）；人數不足回傳 false */
export function proposeRound(): boolean {
  const proposal = generateRound(candidates(), ui.mode)
  if (!proposal) return false
  ui.pending = proposal
  return true
}

/** 分組預覽中：交換兩人位置（隊伍 A/B/休息名單皆可） */
export function swapInPending(idA: string, idB: string) {
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
}

export function startMatch() {
  if (!ui.pending) return
  ui.live = ui.pending
  ui.pending = null
}

export function cancelPending() {
  ui.pending = null
}

/** 賽後輸入比分：寫入紀錄、依實際分組更新 rating 與統計 */
export function submitScore(scoreA: number, scoreB: number): string | null {
  const live = ui.live
  const sess = currentSession.value
  if (!live || !sess) return '沒有進行中的比賽'
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return '比分必須是非負整數'
  }
  if (scoreA === scoreB) return '比分不可平手'

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
  const m = data.matches.find((x) => x.id === matchId)
  if (!m) return '找不到這場比賽'
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return '比分必須是非負整數'
  }
  if (scoreA === scoreB) return '比分不可平手'
  m.scoreA = scoreA
  m.scoreB = scoreB
  runFullRecalc()
  return null
}

export function deleteMatch(matchId: string) {
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

import type { ScoringFormatSnapshot } from './lib/scoring-format'

export type { ScoringFormatSnapshot } from './lib/scoring-format'

export type Mode = 'doubles' | 'singles'

export interface RatingSnapshot {
  rating: number
  rd: number
  vol: number
}

/** 全域參賽者：rating 跨場次累積 */
export interface Player {
  id: string
  name: string
  color: string
  rating: number
  rd: number
  vol: number
  /** 建立時依 1–18 級選擇的初始 rating，全量重算的起點 */
  initialRating: number
  createdAt: number
  archivedAt?: number
}

/** 手動覆寫 rating 的事件（全量重算時依時間序重播） */
export interface RatingOverride {
  id: string
  playerId: string
  rating: number
  at: number
}

/**
 * 固化基準事件：清除歷史紀錄時「保留強度分數」用。
 * 與 RatingOverride 不同——override 只重設 RD（rating/vol 沿用既有邏輯），
 * baseline 則是完整覆寫 rating／rd／vol 三者，相當於「重新設定球員當下的完整狀態」，
 * 讓刪除原始比賽紀錄後，全量重算仍能還原清除前的狀態。
 */
export interface RatingBaseline {
  id: string
  playerId: string
  rating: number
  rd: number
  vol: number
  at: number
}

export type AttendanceEventKind =
  | 'join'
  | 'leave'
  | 'voluntary-rest-start'
  | 'voluntary-rest-end'
  | 'fairness-reset-requested'
  | 'fairness-period-started'
  | 'fairness-recovery-boundary'

/** Append-only authority for active-session attendance and fair-play timing. */
export interface AttendanceEvent {
  id: string
  sessionId: string
  kind: AttendanceEventKind
  /** Recovery boundaries are session-wide; all other events are participant-specific. */
  playerId?: string
  at: number
  /** Session-local stable ordering for same timestamps. */
  sequence: number
  /** A queued reset is bound to this live match until it resolves. */
  liveMatchId?: string
  /** Snapshot used only by an explicit recovery boundary. */
  presentIds?: string[]
  volunteerRestIds?: string[]
}

export interface Match {
  id: string
  sessionId: string
  at: number
  /** Session-local rotation chronology; absent only at the raw legacy boundary. */
  completionSequence?: number
  mode: Mode
  teamA: string[]
  teamB: string[]
  scoreA: number
  scoreB: number
  /** 該回合休息者（含自願休息），用於休息次數統計 */
  resters: string[]
  /** 完賽時的最終賽制來源；舊資料為 legacy-missing，不得由比分反推 */
  scoringFormat: ScoringFormatSnapshot
  /**
   * 比分不符合凍結賽制、但使用者選擇強制記錄。
   * 此場完全不參與任何 rating 計算（即時更新與重播皆略過），
   * 但仍計入上場／休息次數——球是真的打了，公平輪替必須看得到。
   * 缺此欄位＝正常計入（舊資料相容）。
   */
  excludedFromRating?: boolean
  /** Player -> frozen fairness period ID captured when this match began. */
  fairnessPeriodIds?: Record<string, string>
  /** Surviving auditable wildcard origin; never used by Rating replay. */
  rotationWildcard?: RotationWildcardLineageV1
}

/** 單一場次（一天的活動） */
export interface Session {
  id: string
  name: string
  startedAt: number
  /** Next unused completion sequence; absent only at the raw legacy boundary. */
  nextCompletionSequence?: number
  /** Forward-only activity wildcard cooldown; legacy active sessions normalize to zero. */
  rotationWildcardCooldownRemaining?: number
  endedAt?: number
  /** 活動內 rating 重算的固定起點；舊資料遷移前可能缺少 */
  openingRatings?: Record<string, RatingSnapshot>
  /** 依首次加入活動的順序保存，離場或重新加入不會移除／重排 */
  participantIds?: string[]
  /** false 表示舊資料只能推測參賽者集合，無法可靠還原首次加入順序 */
  participantOrderReliable?: boolean
  /** 活動開始後才建立的球員 */
  addedDuringSessionIds?: string[]
  /** 目前在場者 */
  presentIds: string[]
  /** 已標記離場者 */
  leftIds: string[]
  /** 本回合自願休息者 */
  volunteerRest: string[]
  active: boolean
  /** 尚未開打的比賽會繼承的預設賽制；變更只影響之後的比賽 */
  defaultScoringFormat: ScoringFormatSnapshot
  /** Event authority for time-normalized fairness; absent means legacy data. */
  attendanceEvents?: AttendanceEvent[]
  /** Persisted in-progress match; queued fairness operations remain bound across reload. */
  liveMatch?: MatchContext
}

export interface AppData {
  players: Player[]
  sessions: Session[]
  matches: Match[]
  overrides: RatingOverride[]
  baselines: RatingBaseline[]
}

export interface RotationWildcardLineageV1 {
  readonly schemaVersion: 1
  readonly normalPlayingIds: string[]
  readonly exchangedInId: string
  readonly exchangedOutId: string
}

/** 分組結果（純 matchmaking 值，不含賽制） */
export interface RoundProposal {
  mode: Mode
  teamA: string[]
  teamB: string[]
  resters: string[]
  /** Optional auditable origin; it has no Rating authority. */
  rotationWildcard?: RotationWildcardLineageV1
}

/** 分組加上一份獨立賽制快照；live期間可整份替換，completed後唯讀 */
export interface MatchContext extends RoundProposal {
  readonly scoringFormat: ScoringFormatSnapshot
  /** Durable identity established at match start; queued resets bind to it. */
  readonly liveMatchId?: string
  /** Wall-clock boundary at which the final lineup and fairness lineage were frozen. */
  readonly startedAt?: number
  /** Frozen at start; persisted on Match after score submission. */
  readonly fairnessPeriodIds?: Record<string, string>
}

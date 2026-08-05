export type Mode = 'doubles' | 'singles'

/** 全域參賽者：rating 跨場次累積 */
export interface Player {
  id: string
  name: string
  color: string
  rating: number
  rd: number
  vol: number
  /** 建立時選擇的初始 rating（新手/中等/較強），全量重算的起點 */
  initialRating: number
  createdAt: number
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

export interface Match {
  id: string
  sessionId: string
  at: number
  mode: Mode
  teamA: string[]
  teamB: string[]
  scoreA: number
  scoreB: number
  /** 該回合休息者（含自願休息），用於休息次數統計 */
  resters: string[]
}

/** 單一場次（一天的活動） */
export interface Session {
  id: string
  name: string
  startedAt: number
  /** 目前在場者 */
  presentIds: string[]
  /** 已標記離場者 */
  leftIds: string[]
  /** 本回合自願休息者 */
  volunteerRest: string[]
  active: boolean
}

export interface AppData {
  players: Player[]
  sessions: Session[]
  matches: Match[]
  overrides: RatingOverride[]
  baselines: RatingBaseline[]
}

/** 分組結果 */
export interface RoundProposal {
  mode: Mode
  teamA: string[]
  teamB: string[]
  resters: string[]
}

/**
 * 級數：把 Glicko rating 換算成台灣羽球推廣協會的 1–18 級刻度。
 *
 * rating 仍是儲存與計算的單位，級數只是它的另一種寫法——兩者是仿射關係，
 * 1 級 = 100 rating = 100/173.7178 的 mu，8 級 = 1500。關係以 mu 表述一次
 * 並由測試鎖住，避免把 173.7178 抄第二份。
 */
import { DEFAULT_RATING, SCALE } from './glicko2'

/** 級數錨點：8 級 = 1500 = mu 0 */
export const LEVEL_ANCHOR = 8
/** 每級的 rating 間距 */
export const RATING_PER_LEVEL = 100
/** 每級的 mu 間距 */
export const MU_PER_LEVEL = RATING_PER_LEVEL / SCALE

export const toMu = (rating: number): number => (rating - DEFAULT_RATING) / SCALE

/** mu → 級數（連續值） */
export const levelFromMu = (mu: number): number => LEVEL_ANCHOR + mu / MU_PER_LEVEL

/** rating → 級數（連續值） */
export const ratingToLevel = (rating: number): number => levelFromMu(toMu(rating))

/**
 * 級數的顯示值，一位小數（＝10 rating）。
 * 刻意不夾在 1–18：清單是照實力排序的，夾了會讓實力不同的兩人看起來一樣。
 */
export const formatLevel = (rating: number): string => ratingToLevel(rating).toFixed(1)

/** 實力的完整顯示：積分（級數）。所有顯示點共用，避免各處自己拼字串 */
export const formatStrength = (rating: number): string =>
  `${Math.round(rating)}（${formatLevel(rating)} 級）`

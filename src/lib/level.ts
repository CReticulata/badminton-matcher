/**
 * 級數：Glicko-2 的內部量 mu 平移 8 級。
 *
 * 1 級 = 1 mu = 173.7178 rating，8 級 = 1500 = mu 0。
 * 選這個刻度是因為 mu 才是 Glicko logistic 的自然單位——一級差就是勝算
 * e 倍，與 rating 尺度上「一級 100 分」這種人為選擇不同。
 * rating 仍是唯一儲存與計算的量；級數只是它的另一種寫法。
 */
import { DEFAULT_RATING, SCALE } from './glicko2'

/** 級數錨點：8 級 = 1500 = mu 0 */
export const LEVEL_ANCHOR = 8
/** 每級的 mu 間距。級數就是 mu 平移，所以是 1 */
export const MU_PER_LEVEL = 1
/** 每級的 rating 間距，由 mu 間距導出而非另行選定 */
export const RATING_PER_LEVEL = MU_PER_LEVEL * SCALE
export const MIN_LEVEL = 1
export const MAX_LEVEL = 18

export const toMu = (rating: number): number => (rating - DEFAULT_RATING) / SCALE

/** mu → 級數（連續值） */
export const levelFromMu = (mu: number): number => LEVEL_ANCHOR + mu / MU_PER_LEVEL

/** rating → 級數（連續值） */
export const ratingToLevel = (rating: number): number => levelFromMu(toMu(rating))

/** 級數 → rating */
export const levelToRating = (level: number): number =>
  DEFAULT_RATING + (level - LEVEL_ANCHOR) * RATING_PER_LEVEL

/**
 * 級數的顯示值，一位小數（＝17.4 rating）。
 * 刻意不夾在 1–18：清單是照實力排序的，夾了會讓實力不同的兩人看起來一樣。
 */
export const formatLevel = (rating: number): string => ratingToLevel(rating).toFixed(1)

/** 實力的完整顯示：積分（級數）。所有顯示點共用，避免各處自己拼字串 */
export const formatStrength = (rating: number): string =>
  `${Math.round(rating)}（${formatLevel(rating)} 級）`

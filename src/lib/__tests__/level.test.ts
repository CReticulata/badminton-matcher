import { describe, expect, it } from 'vitest'
import { SCALE } from '../glicko2'
import {
  MU_PER_LEVEL,
  RATING_PER_LEVEL,
  formatLevel,
  formatStrength,
  levelFromMu,
  levelToRating,
  ratingToLevel,
  toMu,
} from '../level'

describe('級數就是 mu 平移 8 級', () => {
  it('8 級 = 1500 = mu 0', () => {
    expect(ratingToLevel(1500)).toBe(8)
    expect(levelToRating(8)).toBe(1500)
    expect(toMu(1500)).toBe(0)
  })

  it('一級等於 1 mu，也就是 173.7178 rating', () => {
    expect(MU_PER_LEVEL).toBe(1)
    expect(RATING_PER_LEVEL).toBe(SCALE)
    expect(levelFromMu(1)).toBe(9)
    expect(levelToRating(9) - levelToRating(8)).toBeCloseTo(SCALE, 10)
  })

  it('級數與 mu 只差一個常數', () => {
    for (const rating of [284, 800, 1234, 1500, 2500, 3237]) {
      expect(ratingToLevel(rating)).toBeCloseTo(toMu(rating) + 8, 12)
    }
  })

  it('rating 與級數互為反函數', () => {
    for (let level = 1; level <= 18; level += 1) {
      expect(ratingToLevel(levelToRating(level))).toBeCloseTo(level, 12)
    }
  })
})

describe('顯示格式', () => {
  it('級數顯示一位小數', () => {
    expect(formatLevel(1500)).toBe('8.0')
    expect(formatLevel(1673.7)).toBe('9.0')
    expect(formatLevel(1600)).toBe('8.6')
  })

  it('超出 1–18 時顯示真實級數，不夾範圍', () => {
    expect(formatLevel(400)).toBe('1.7')
    expect(formatLevel(3500)).toBe('19.5')
    // 極低分會落到負級數；仍照實顯示，夾了會讓排序中實力不同的兩人看起來一樣
    expect(formatLevel(100)).toBe('-0.1')
  })

  it('實力顯示為積分（級數）', () => {
    expect(formatStrength(1500)).toBe('1500（8.0 級）')
    expect(formatStrength(1600)).toBe('1600（8.6 級）')
    expect(formatStrength(1499.6)).toBe('1500（8.0 級）')
  })
})

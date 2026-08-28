import { describe, expect, it } from 'vitest'
import { SCALE } from '../glicko2'
import {
  MU_PER_LEVEL,
  formatLevel,
  formatStrength,
  levelFromMu,
  ratingToLevel,
  toMu,
} from '../level'

describe('級數換算', () => {
  it('8 級 = 1500 = mu 0', () => {
    expect(ratingToLevel(1500)).toBeCloseTo(8, 12)
    expect(toMu(1500)).toBe(0)
  })

  it('一級等於 100 rating，也等於 100/173.7178 的 mu', () => {
    expect(ratingToLevel(1600) - ratingToLevel(1500)).toBeCloseTo(1, 12)
    expect(MU_PER_LEVEL).toBeCloseTo(100 / SCALE, 12)
    expect(levelFromMu(MU_PER_LEVEL)).toBeCloseTo(9, 12)
  })

  it('直接換算與繞過 mu 的換算一致', () => {
    for (const rating of [800, 1234, 1500, 1523, 2500]) {
      expect(ratingToLevel(rating)).toBeCloseTo(8 + (rating - 1500) / 100, 10)
    }
  })

  it('18 個初始等級都換回整數級', () => {
    for (let level = 1; level <= 18; level += 1) {
      expect(ratingToLevel(800 + (level - 1) * 100)).toBeCloseTo(level, 12)
    }
  })
})

describe('顯示格式', () => {
  it('級數顯示一位小數', () => {
    expect(formatLevel(1523)).toBe('8.2')
    expect(formatLevel(1500)).toBe('8.0')
    expect(formatLevel(1868)).toBe('11.7')
  })

  it('超出 1–18 時顯示真實級數，不夾範圍', () => {
    expect(formatLevel(730)).toBe('0.3')
    expect(formatLevel(2650)).toBe('19.5')
  })

  it('實力顯示為積分（級數）', () => {
    expect(formatStrength(1523)).toBe('1523（8.2 級）')
    expect(formatStrength(1500)).toBe('1500（8.0 級）')
    expect(formatStrength(1499.6)).toBe('1500（8.0 級）')
  })
})

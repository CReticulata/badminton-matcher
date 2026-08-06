import { describe, expect, it } from 'vitest'
import { INITIAL_LEVELS } from './store'

describe('INITIAL_LEVELS', () => {
  it('依台灣羽球推廣協會分級提供 1 到 18 級選項', () => {
    expect(INITIAL_LEVELS).toHaveLength(18)
    expect(INITIAL_LEVELS.map((item) => item.level)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    )
    expect(INITIAL_LEVELS.map((item) => item.tier)).toEqual([
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
    ])
  })

  it('用等距 Glicko-2 初始分數涵蓋 800 到 2500，8 級維持既有預設 1500', () => {
    expect(INITIAL_LEVELS.map((item) => item.rating)).toEqual(
      Array.from({ length: 18 }, (_, index) => 800 + index * 100),
    )
    expect(INITIAL_LEVELS.find((item) => item.level === 8)?.rating).toBe(1500)
  })
})

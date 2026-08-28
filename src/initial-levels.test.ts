import { describe, expect, it } from 'vitest'
import { INITIAL_LEVELS } from './store'
import { ratingToLevel } from './lib/level'

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

  it('每級等距 1 mu，8 級維持既有預設 1500', () => {
    expect(INITIAL_LEVELS.map((item) => item.rating)).toEqual([
      284, 458, 631, 805, 979, 1153, 1326, 1500, 1674, 1847, 2021, 2195, 2369, 2542, 2716,
      2890, 3063, 3237,
    ])
    expect(INITIAL_LEVELS.find((item) => item.level === 8)?.rating).toBe(1500)
    // 表上的分數換回級數就是原級數——選什麼就看到什麼
    for (const item of INITIAL_LEVELS) {
      expect(ratingToLevel(item.rating)).toBeCloseTo(item.level, 2)
    }
  })
})

/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import matchmakingSource from '../matchmaking.ts?raw'
import {
  BETA,
  BETA_CI,
  balanceBand,
  describeBalance,
  expectedMargin,
} from '../expected-margin'
import {
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
} from '../scoring-format'

const FMT15 = createCatalogSnapshot('badminton-15-w2-c21')
const FMT21 = createCatalogSnapshot('badminton-21-w2-c30')

describe('expectedMargin', () => {
  it('與校準文件的 15/2/21 對照表一致（誤差 < 0.01）', () => {
    // docs/research/score-aware-margin-calibration.md 的 Δrating → 預期分差
    const table: [number, number][] = [
      [0, 4.48], [50, 4.63], [100, 5.06], [150, 5.70],
      [200, 6.47], [300, 8.12], [400, 9.61],
    ]
    for (const [gap, expected] of table) {
      expect(expectedMargin(gap, FMT15)!).toBeCloseTo(expected, 2)
    }
  })

  it('對 rating 差單調遞增（因此不可作為分組目標函數）', () => {
    let previous = -Infinity
    for (let gap = 0; gap <= 600; gap += 25) {
      const margin = expectedMargin(gap, FMT15)!
      expect(margin).toBeGreaterThan(previous)
      previous = margin
    }
  })

  it('正負 rating 差對稱', () => {
    expect(expectedMargin(-200, FMT15)).toBe(expectedMargin(200, FMT15))
  })

  it('21 分制的預期分差大於 15 分制（局數較長）', () => {
    expect(expectedMargin(200, FMT21)!).toBeGreaterThan(expectedMargin(200, FMT15)!)
  })

  it('自訂賽制可用，含 cap === target 的先到先贏', () => {
    const custom = createCustomSnapshot('先到 11 分', { target: 11, winBy: 1, cap: 11 })
    const margin = expectedMargin(100, custom)
    expect(margin).toBeGreaterThan(0)
    expect(Number.isFinite(margin!)).toBe(true)
  })

  it('賽制未知時回傳 null，不以預設賽制代替', () => {
    expect(expectedMargin(200, createUnknownSnapshot('legacy-missing'))).toBeNull()
    expect(expectedMargin(200, createUnknownSnapshot('explicit-unknown'))).toBeNull()
  })

  it('非有限輸入回傳 null', () => {
    expect(expectedMargin(NaN, FMT15)).toBeNull()
    expect(expectedMargin(Infinity, FMT15)).toBeNull()
  })

  it('係數與其信賴區間一併記錄', () => {
    expect(BETA).toBeCloseTo(0.2552, 4)
    expect(BETA_CI[0]).toBeLessThan(BETA)
    expect(BETA_CI[1]).toBeGreaterThan(BETA)
  })
})

describe('describeBalance', () => {
  it('相同賽制下差距越大，分段越嚴重', () => {
    const bands = [0, 200, 300, 500].map((gap) => balanceBand(expectedMargin(gap, FMT15)!))
    expect(bands[0]).toBe('even')
    expect(new Set(bands).size).toBeGreaterThan(1)
  })

  it('不提供預測比分或勝率', () => {
    const text = describeBalance(200, FMT15)!
    expect(text).toContain('約')
    expect(text).not.toMatch(/\d+\s*[:：]\s*\d+/)
    expect(text).not.toContain('%')
    expect(text).not.toContain('勝率')
  })

  it('賽制未知時沒有說明', () => {
    expect(describeBalance(200, createUnknownSnapshot('legacy-missing'))).toBeNull()
  })
})

describe('分組不得依賴本模組', () => {
  it('matchmaking.ts 沒有 import expected-margin 或賽制模組', () => {
    expect(matchmakingSource).not.toContain('expected-margin')
    expect(matchmakingSource).not.toContain('scoring-format')
  })
})

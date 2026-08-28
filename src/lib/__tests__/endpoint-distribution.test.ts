import { describe, expect, it } from 'vitest'
import { endpointStats } from '../endpoint-distribution'
import { createCatalogSnapshot, createCustomSnapshot } from '../scoring-format'

const R15 = createCatalogSnapshot('badminton-15-w2-c21').rules
const R21 = createCatalogSnapshot('badminton-21-w2-c30').rules

describe('endpointStats', () => {
  it('每球勝率 0.5 時勝率為 0.5', () => {
    expect(endpointStats(0.5, R15).winProbability).toBeCloseTo(0.5, 10)
  })

  it('勝率對每球勝率單調遞增', () => {
    let previous = -1
    for (let q = 0.3; q <= 0.7; q += 0.02) {
      const p = endpointStats(q, R15).winProbability
      expect(p).toBeGreaterThan(previous)
      previous = p
    }
  })

  it('對 0.5 對稱：P(q) + P(1−q) = 1', () => {
    for (const q of [0.35, 0.45, 0.52, 0.68]) {
      expect(endpointStats(q, R15).winProbability + endpointStats(1 - q, R15).winProbability)
        .toBeCloseTo(1, 10)
    }
  })

  it('極端值', () => {
    expect(endpointStats(1, R15).winProbability).toBe(1)
    expect(endpointStats(0, R15).winProbability).toBe(0)
  })

  it('預期絕對分差在實力相同時仍為正（總得有人贏）', () => {
    expect(endpointStats(0.5, R15).meanMargin).toBeCloseTo(4.48, 2)
  })

  it('與校準文件記載的對照表一致', () => {
    // docs/research/score-aware-margin-calibration.md，beta = 0.2552
    const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
    const table: [number, number, number][] = [
      [0, 0.500, 4.48], [100, 0.763, 5.06], [200, 0.923, 6.47], [400, 0.997, 9.61],
    ]
    for (const [gap, win, margin] of table) {
      const stats = endpointStats(sigmoid((0.2552 * gap) / 100), R15)
      expect(stats.winProbability).toBeCloseTo(win, 3)
      expect(stats.meanMargin).toBeCloseTo(margin, 2)
    }
  })

  it('局數較長者預期分差較大', () => {
    expect(endpointStats(0.6, R21).meanMargin).toBeGreaterThan(endpointStats(0.6, R15).meanMargin)
  })

  it('支援 cap === target 的先到先贏', () => {
    const rules = createCustomSnapshot('先到 11 分', { target: 11, winBy: 1, cap: 11 }).rules
    expect(endpointStats(0.5, rules).winProbability).toBeCloseTo(0.5, 10)
  })

  it('非有限輸入被拒絕', () => {
    expect(() => endpointStats(NaN, R15)).toThrow()
  })
})

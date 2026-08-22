import { describe, expect, it } from 'vitest'
import fixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-endpoint-mirrors-and-edges.json?raw'
import { endpointDistribution, endpointProbability, integratedEndpointPrediction, isLegalEndpoint } from '../endpoint'
import { GAUSS_HERMITE_31 } from '../quadrature'

const fixture = JSON.parse(fixtureText) as {
  expected: {
    gaussHermite31: { nodesHex: string[]; normalizedWeightsHex: string[] }
    integratedPrediction: {
      endpointNllHex: string
      endpointProbabilityHex: string
      latentMeanHex: string
      latentVarianceHex: string
      winner: 'A' | 'B'
      winnerProbabilityAHex: string
    }
    legalEndpointScores: [number, number][]
  }
  input: { endpoints: [number, number][] }
}

function fromHex(hex: string): number {
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return new DataView(bytes.buffer).getFloat64(0, false)
}

function toHex(value: number): string {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value, false)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function positiveUlpDistance(left: number, right: number): number {
  const leftBits = BigInt(`0x${toHex(left)}`)
  const rightBits = BigInt(`0x${toHex(right)}`)
  return Number(leftBits >= rightBits ? leftBits - rightBits : rightBits - leftBits)
}

describe('rating-j1 endpoints and quadrature', () => {
  it('matches all 31 fixture GH binary64 constants exactly', () => {
    expect(Array.from(GAUSS_HERMITE_31.nodes, toHex)).toEqual(fixture.expected.gaussHermite31.nodesHex)
    expect(Array.from(GAUSS_HERMITE_31.normalizedWeights, toHex)).toEqual(fixture.expected.gaussHermite31.normalizedWeightsHex)
  })

  it('normalizes all 42 legal endpoints and preserves swap symmetry', () => {
    const probabilities = endpointDistribution(0.35)
    expect(probabilities).toHaveLength(42)
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 14)
    for (const [a, b] of fixture.expected.legalEndpointScores) {
      expect(isLegalEndpoint(a, b)).toBe(true)
      expect(endpointProbability(a, b, 0.35)).toBeCloseTo(endpointProbability(b, a, -0.35), 15)
    }
  })

  it('returns zero for illegal endpoint scores and fails closed for invalid integration inputs', () => {
    expect(isLegalEndpoint(21, 18)).toBe(false)
    expect(endpointProbability(21, 18, 0.35)).toBe(0)
    expect(integratedEndpointPrediction(0.35, -1, 21, 20)).toBeNull()
    expect(integratedEndpointPrediction(Number.NaN, 1, 21, 20)).toBeNull()
    expect(integratedEndpointPrediction(0.35, 1, 21, 18)).toBeNull()
  })

  it('matches fixture integrated prediction bit-for-bit in fixed node order', () => {
    const expected = fixture.expected.integratedPrediction
    const actual = integratedEndpointPrediction(
      fromHex(expected.latentMeanHex),
      fromHex(expected.latentVarianceHex),
      fixture.input.endpoints[0][0],
      fixture.input.endpoints[0][1],
    )
    expect(actual).not.toBeNull()
    expect(toHex(actual!.latentMean)).toBe(expected.latentMeanHex)
    expect(toHex(actual!.latentVariance)).toBe(expected.latentVarianceHex)
    expect(toHex(actual!.endpointProbability)).toBe(expected.endpointProbabilityHex)
    expect(toHex(actual!.endpointNll)).toBe(expected.endpointNllHex)
    const expectedWinnerProbability = fromHex(expected.winnerProbabilityAHex)
    expect(Math.abs(actual!.winnerProbabilityA - expectedWinnerProbability)).toBeLessThanOrEqual(1e-12)
    // Python and V8 integer exponentiation first differ by one ULP on individual
    // endpoint terms; the prescribed node-first reduction must remain within one.
    expect(positiveUlpDistance(actual!.winnerProbabilityA, expectedWinnerProbability)).toBeLessThanOrEqual(1)
    expect(actual!.winner).toBe(expected.winner)
  })
})

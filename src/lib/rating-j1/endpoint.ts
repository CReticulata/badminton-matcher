import { GAUSS_HERMITE_31 } from './quadrature'
import type { EndpointPrediction } from './types'

export const LEGAL_ENDPOINT_SCORES: readonly (readonly [number, number])[] = Object.freeze([
  ...Array.from({ length: 14 }, (_, loser) => [[15, loser] as const, [loser, 15] as const]).flat(),
  ...Array.from({ length: 5 }, (_, winner) => [[winner + 16, winner + 14] as const, [winner + 14, winner + 16] as const]).flat(),
  [21, 19], [19, 21], [21, 20], [20, 21],
])

function stableLogistic(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value)
    return 1 / (1 + exp)
  }
  const exp = Math.exp(value)
  return exp / (1 + exp)
}

function choose(n: number, k: number): number {
  const small = Math.min(k, n - k)
  let result = 1
  for (let index = 1; index <= small; index += 1) result = (result * (n - small + index)) / index
  return result
}

export function isLegalEndpoint(scoreA: number, scoreB: number): boolean {
  return Number.isInteger(scoreA) && Number.isInteger(scoreB) && LEGAL_ENDPOINT_SCORES.some(([a, b]) => a === scoreA && b === scoreB)
}

export function endpointProbability(scoreA: number, scoreB: number, latent: number): number {
  if (!isLegalEndpoint(scoreA, scoreB) || !Number.isFinite(latent)) return 0
  const probabilityA = stableLogistic(latent)
  const probabilityB = stableLogistic(-latent)
  const winnerA = scoreA > scoreB
  const winner = winnerA ? scoreA : scoreB
  const loser = winnerA ? scoreB : scoreA
  const winProbability = winnerA ? probabilityA : probabilityB
  const lossProbability = winnerA ? probabilityB : probabilityA
  if (winner === 15) return choose(14 + loser, loser) * winProbability ** 15 * lossProbability ** loser
  if (winner <= 20) return choose(28, 14) * 2 ** (loser - 14) * winProbability ** winner * lossProbability ** loser
  return choose(28, 14) * 2 ** (loser - 14) * winProbability ** winner * lossProbability ** loser
}

export function endpointDistribution(latent: number): number[] {
  if (!Number.isFinite(latent)) return []
  return LEGAL_ENDPOINT_SCORES.map(([scoreA, scoreB]) => endpointProbability(scoreA, scoreB, latent))
}

export function integratedEndpointPrediction(
  mean: number,
  variance: number,
  scoreA: number,
  scoreB: number,
): EndpointPrediction | null {
  if (!Number.isFinite(mean) || !Number.isFinite(variance) || variance < 0 || !isLegalEndpoint(scoreA, scoreB)) return null
  const singleNode = variance <= 1e-15
  const scale = singleNode ? 0 : Math.sqrt(2 * variance)
  const nodeCount = singleNode ? 1 : GAUSS_HERMITE_31.nodes.length
  let endpoint = 0
  let winnerProbabilityA = 0
  for (let index = 0; index < nodeCount; index += 1) {
    const node = singleNode ? mean : mean + scale * GAUSS_HERMITE_31.nodes[index]
    const weight = singleNode ? 1 : GAUSS_HERMITE_31.normalizedWeights[index]
    endpoint += weight * endpointProbability(scoreA, scoreB, node)
    let winnerAtNode = 0
    for (const [a, b] of LEGAL_ENDPOINT_SCORES) {
      if (a > b) winnerAtNode += endpointProbability(a, b, node)
    }
    winnerProbabilityA += weight * winnerAtNode
  }
  if (!Number.isFinite(endpoint) || !Number.isFinite(winnerProbabilityA)) return null
  return {
    latentMean: mean,
    latentVariance: variance,
    endpointProbability: endpoint,
    endpointNll: -Math.log(Math.max(endpoint, 1e-300)),
    winnerProbabilityA,
    winner: scoreA > scoreB ? 'A' : 'B',
  }
}

export const MAX_DENSE_DIMENSION = 256

export interface DenseMatrix {
  readonly rows: number
  readonly columns: number
  readonly values: Float64Array
}

export interface EndpointPrediction {
  readonly latentMean: number
  readonly latentVariance: number
  readonly endpointProbability: number
  readonly endpointNll: number
  readonly winnerProbabilityA: number
  readonly winner: Winner
}

export type Winner = 'A' | 'B'

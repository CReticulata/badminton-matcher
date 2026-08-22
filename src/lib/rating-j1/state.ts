export interface J1LongSnapshot {
  readonly mean: Float64Array
  readonly covariance: Float64Array
  readonly roster: readonly number[]
}

export interface J1JointSnapshot extends J1LongSnapshot {
  readonly activityId: number
}

function finiteArray(values: Float64Array): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false
  return true
}

/** Browser-safe dense x/u state with copies at every public boundary. */
export class DenseJ1State {
  readonly roster: readonly number[]
  readonly #index: ReadonlyMap<number, number>
  private readonly n: number
  private mean: Float64Array
  private covariance: Float64Array
  private jointMean: Float64Array | null = null
  private jointCovariance: Float64Array | null = null
  private activity: number | null = null

  constructor(roster: readonly number[], initialVariance = 0.85 ** 2, omega = 0.30) {
    if (roster.length < 4 || new Set(roster).size !== roster.length || roster.some((value) => !Number.isSafeInteger(value))) {
      throw new RangeError('J1 requires a unique integer roster of at least four players')
    }
    if (!Number.isFinite(initialVariance) || initialVariance < 0 || !Number.isFinite(omega) || omega < 0) {
      throw new RangeError('J1 scales must be finite and non-negative')
    }
    this.roster = Object.freeze([...roster])
    this.#index = new Map(this.roster.map((player, index) => [player, index]))
    this.n = roster.length
    this.mean = new Float64Array(this.n)
    this.covariance = new Float64Array(this.n * this.n)
    for (let i = 0; i < this.n; i += 1) this.covariance[i * this.n + i] = initialVariance
    this.omega = omega
  }

  private readonly omega: number

  get activeActivityId(): number | null { return this.activity }
  get dimension(): number { return this.activity === null ? this.n : this.n * 2 }
  playerIndex(player: number): number | undefined { return this.#index.get(player) }

  snapshot(): J1LongSnapshot {
    return { roster: this.roster, mean: new Float64Array(this.longMean()), covariance: new Float64Array(this.longCovariance()) }
  }

  jointSnapshot(): J1JointSnapshot {
    if (this.activity === null || this.jointMean === null || this.jointCovariance === null) throw new RangeError('no activity is open')
    return { activityId: this.activity, roster: this.roster, mean: new Float64Array(this.jointMean), covariance: new Float64Array(this.jointCovariance) }
  }

  open(activityId: number): void {
    if (!Number.isSafeInteger(activityId) || activityId < 0) throw new RangeError('invalid activity id')
    if (this.activity !== null) {
      if (this.activity !== activityId) throw new RangeError('another activity is open')
      return
    }
    const dimension = this.n * 2
    this.jointMean = new Float64Array(dimension)
    this.jointMean.set(this.mean)
    this.jointCovariance = new Float64Array(dimension * dimension)
    for (let row = 0; row < this.n; row += 1) {
      this.jointCovariance.set(this.covariance.subarray(row * this.n, row * this.n + this.n), row * dimension)
      this.jointCovariance[(this.n + row) * dimension + this.n + row] = this.omega ** 2
    }
    this.activity = activityId
  }

  close(activityId?: number): void {
    if (this.activity === null || this.jointMean === null || this.jointCovariance === null) throw new RangeError('no activity is open')
    if (activityId !== undefined && activityId !== this.activity) throw new RangeError('can only close active activity')
    this.mean = new Float64Array(this.jointMean.subarray(0, this.n))
    this.covariance = new Float64Array(this.n * this.n)
    const dimension = this.n * 2
    for (let row = 0; row < this.n; row += 1) this.covariance.set(this.jointCovariance.subarray(row * dimension, row * dimension + this.n), row * this.n)
    this.jointMean = null
    this.jointCovariance = null
    this.activity = null
  }

  clone(): DenseJ1State {
    const clone = new DenseJ1State(this.roster, 0, this.omega)
    clone.mean = new Float64Array(this.mean)
    clone.covariance = new Float64Array(this.covariance)
    clone.jointMean = this.jointMean === null ? null : new Float64Array(this.jointMean)
    clone.jointCovariance = this.jointCovariance === null ? null : new Float64Array(this.jointCovariance)
    clone.activity = this.activity
    return clone
  }

  addParticipantVariance(participants: readonly number[], increments: readonly number[]): void {
    if (participants.length !== increments.length || participants.some((player) => !this.#index.has(player))) throw new RangeError('invalid participant variance')
    const covariance = this.activeCovariance()
    const dimension = this.dimension
    for (let i = 0; i < participants.length; i += 1) {
      if (!Number.isFinite(increments[i]) || increments[i] < 0) throw new RangeError('invalid process variance')
      const index = this.#index.get(participants[i])!
      covariance[index * dimension + index] += increments[i]
    }
    if (!finiteArray(covariance)) throw new RangeError('non-finite covariance')
  }

  latent(participants: readonly number[]): { mean: number; variance: number; h: Float64Array } {
    if (participants.length !== 4 || new Set(participants).size !== 4 || participants.some((player) => !this.#index.has(player))) throw new RangeError('J1 requires four unique roster participants')
    const dimension = this.dimension
    const h = new Float64Array(dimension)
    for (let i = 0; i < 4; i += 1) {
      const coefficient = i < 2 ? 0.5 : -0.5
      const index = this.#index.get(participants[i])!
      h[index] = coefficient
      if (dimension > this.n) h[this.n + index] = coefficient
    }
    const meanVector = this.activeMean()
    const covariance = this.activeCovariance()
    let mean = 0
    for (let i = 0; i < dimension; i += 1) mean += h[i] * meanVector[i]
    let variance = 0
    for (let row = 0; row < dimension; row += 1) for (let col = 0; col < dimension; col += 1) variance += h[row] * covariance[row * dimension + col] * h[col]
    if (!Number.isFinite(mean) || !Number.isFinite(variance)) throw new RangeError('non-finite latent moments')
    return { mean, variance: Math.max(0, variance), h }
  }

  project(h: Float64Array, priorMean: number, priorVariance: number, posteriorMean: number, posteriorVariance: number): void {
    const dimension = this.dimension
    if (h.length !== dimension || ![priorMean, priorVariance, posteriorMean, posteriorVariance].every(Number.isFinite)) throw new RangeError('non-finite projection')
    if (priorVariance < 0 || posteriorVariance < 0) throw new RangeError('projection variances must be non-negative')
    if (priorVariance < 1e-15) return
    const covariance = this.activeCovariance()
    const mean = this.activeMean()
    const ph = new Float64Array(dimension)
    for (let row = 0; row < dimension; row += 1) for (let col = 0; col < dimension; col += 1) ph[row] += covariance[row * dimension + col] * h[col]
    const delta = (posteriorMean - priorMean) / priorVariance
    const scale = (posteriorVariance - priorVariance) / (priorVariance * priorVariance)
    const nextMean = new Float64Array(mean)
    const nextCovariance = new Float64Array(covariance)
    for (let row = 0; row < dimension; row += 1) {
      nextMean[row] += ph[row] * delta
      for (let col = 0; col < dimension; col += 1) nextCovariance[row * dimension + col] += ph[row] * ph[col] * scale
    }
    for (let row = 0; row < dimension; row += 1) for (let col = row + 1; col < dimension; col += 1) {
      const symmetric = (nextCovariance[row * dimension + col] + nextCovariance[col * dimension + row]) / 2
      nextCovariance[row * dimension + col] = symmetric
      nextCovariance[col * dimension + row] = symmetric
    }
    if (!finiteArray(nextMean) || !finiteArray(nextCovariance)) throw new RangeError('non-finite posterior')
    if (this.activity === null) { this.mean = nextMean; this.covariance = nextCovariance } else { this.jointMean = nextMean; this.jointCovariance = nextCovariance }
  }

  private longMean(): Float64Array { return this.activity === null ? this.mean : this.jointMean!.subarray(0, this.n) }
  private longCovariance(): Float64Array {
    if (this.activity === null) return this.covariance
    const result = new Float64Array(this.n * this.n)
    const dimension = this.n * 2
    for (let row = 0; row < this.n; row += 1) result.set(this.jointCovariance!.subarray(row * dimension, row * dimension + this.n), row * this.n)
    return result
  }
  private activeMean(): Float64Array { return this.activity === null ? this.mean : this.jointMean! }
  private activeCovariance(): Float64Array { return this.activity === null ? this.covariance : this.jointCovariance! }
}

import { endpointProbability, integratedEndpointPrediction, isLegalEndpoint } from './endpoint'
import { GAUSS_HERMITE_31 } from './quadrature'
import { DenseJ1State, type J1LongSnapshot } from './state'

export interface J1PregameView {
  readonly eventId: string
  readonly activityId: number
  readonly gameIndex: number
  readonly completedAtMinute: number
  readonly activityAttendees: readonly number[]
  readonly teamA: readonly [number, number]
  readonly teamB: readonly [number, number]
  readonly targetPoints: number
  readonly winBy: number
  readonly capPoints: number
}

export interface J1Prediction { readonly latentMean: number; readonly latentVariance: number; readonly endpointProbability?: number; readonly endpointNll?: number }
export interface J1Preparation { readonly eventId: string; readonly version: number; readonly prediction: J1Prediction; readonly deltaWeeks: readonly number[] }
export interface J1CloseSnapshot extends J1LongSnapshot { readonly activityId: number; readonly clocks: readonly (number | null)[] }
interface Pending { readonly token: J1Preparation; readonly view: J1PregameView; readonly state: DenseJ1State; readonly clocks: readonly (number | null)[]; readonly deltas: readonly number[] }

function equalView(left: J1PregameView, right: J1PregameView): boolean {
  return left.eventId === right.eventId && left.activityId === right.activityId && left.gameIndex === right.gameIndex && left.completedAtMinute === right.completedAtMinute && left.targetPoints === right.targetPoints && left.winBy === right.winBy && left.capPoints === right.capPoints && left.activityAttendees.length === right.activityAttendees.length && left.activityAttendees.every((player, index) => player === right.activityAttendees[index]) && left.teamA[0] === right.teamA[0] && left.teamA[1] === right.teamA[1] && left.teamB[0] === right.teamB[0] && left.teamB[1] === right.teamB[1]
}
function participants(view: J1PregameView): readonly number[] { return [view.teamA[0], view.teamA[1], view.teamB[0], view.teamB[1]] }
function validView(view: J1PregameView): boolean {
  if ('scoreA' in view || 'scoreB' in view || !Array.isArray(view.activityAttendees) || !Array.isArray(view.teamA) || !Array.isArray(view.teamB)) return false
  const people = participants(view)
  return typeof view.eventId === 'string' && view.eventId.length > 0 && Number.isSafeInteger(view.activityId) && view.activityId >= 0 && Number.isSafeInteger(view.gameIndex) && view.gameIndex >= 0 && Number.isSafeInteger(view.completedAtMinute) && view.completedAtMinute >= 0 && view.teamA.length === 2 && view.teamB.length === 2 && people.every(Number.isSafeInteger) && new Set(people).size === 4 && view.activityAttendees.every(Number.isSafeInteger) && new Set(view.activityAttendees).size === view.activityAttendees.length && people.every((player) => view.activityAttendees.includes(player)) && view.targetPoints === 15 && view.winBy === 2 && view.capPoints === 21
}
function frozenView(view: J1PregameView): J1PregameView {
  return Object.freeze({
    eventId: view.eventId, activityId: view.activityId, gameIndex: view.gameIndex,
    completedAtMinute: view.completedAtMinute,
    activityAttendees: Object.freeze([...view.activityAttendees]),
    teamA: Object.freeze([view.teamA[0], view.teamA[1]]) as readonly [number, number],
    teamB: Object.freeze([view.teamB[0], view.teamB[1]]) as readonly [number, number],
    targetPoints: view.targetPoints, winBy: view.winBy, capPoints: view.capPoints,
  })
}
function closeCopy(state: DenseJ1State, activityId: number): void { if (state.activeActivityId !== null && state.activeActivityId !== activityId) state.close() }
function arraysEqual(left: Float64Array, right: Float64Array): boolean { return left.length === right.length && left.every((value, index) => Object.is(value, right[index])) }

/** Fixed-roster, score-free-prepared J1-CT-96 endpoint filter. */
export class J1Filter {
  private state: DenseJ1State
  private clocks: (number | null)[]
  private version = 0
  private pending: Pending | null = null
  private readonly sigma: number

  constructor(roster: readonly number[], options: { readonly sigma: number; readonly omega?: number; readonly initialVariance?: number }) {
    if (!Number.isFinite(options.sigma) || options.sigma < 0) throw new RangeError('sigma must be finite and non-negative')
    this.state = new DenseJ1State(roster, options.initialVariance ?? 0.85 ** 2, options.omega ?? 0.30)
    this.clocks = Array.from({ length: roster.length }, () => null)
    this.sigma = options.sigma
  }

  get activeActivityId(): number | null { return this.state.activeActivityId }
  get currentJointDimension(): number { return this.state.dimension }
  get playerClocks(): readonly (number | null)[] { return Object.freeze([...this.clocks]) }
  snapshot(): { readonly state: J1LongSnapshot | J1CloseSnapshot; readonly clocks: readonly (number | null)[]; readonly version: number; readonly activeActivityId: number | null } {
    const state = this.state.activeActivityId === null ? this.state.snapshot() : this.state.jointSnapshot()
    return Object.freeze({ state, clocks: Object.freeze([...this.clocks]), version: this.version, activeActivityId: this.state.activeActivityId })
  }

  prepare(view: J1PregameView): J1Preparation {
    if (!validView(view)) throw new RangeError('invalid score-free J1 pregame view')
    if (this.pending !== null) throw new RangeError('a preparation is already pending')
    const preparedView = frozenView(view)
    const staged = this.transition(preparedView)
    const latent = staged.state.latent(participants(preparedView))
    const token = Object.freeze({ eventId: view.eventId, version: this.version, prediction: Object.freeze({ latentMean: latent.mean, latentVariance: latent.variance }), deltaWeeks: Object.freeze([...staged.deltas]) })
    this.pending = { token, view: preparedView, state: staged.state, clocks: Object.freeze([...staged.clocks]), deltas: Object.freeze([...staged.deltas]) }
    return token
  }

  commit(view: J1PregameView, token: J1Preparation, scoreA: number, scoreB: number): J1Prediction {
    if (!validView(view) || !isLegalEndpoint(scoreA, scoreB)) throw new RangeError('J1 outcome endpoint metadata is not legal')
    const pending = this.pending
    if (pending === null || token !== pending.token || token.version !== this.version || !equalView(view, pending.view)) throw new RangeError('stale, foreign, or mismatched J1 preparation')
    const recomputed = this.transition(pending.view)
    const moments = recomputed.state.latent(participants(pending.view))
    if (!arraysEqual(recomputed.state.snapshot().mean, pending.state.snapshot().mean) || !arraysEqual(recomputed.state.snapshot().covariance, pending.state.snapshot().covariance) || !moments || moments.mean !== token.prediction.latentMean || moments.variance !== token.prediction.latentVariance) throw new RangeError('J1 prepared transition does not match live state')
    const state = recomputed.state
    state.open(view.activityId)
    const prior = state.latent(participants(view))
    const posterior = this.posterior(scoreA, scoreB, prior.mean, prior.variance)
    state.project(prior.h, prior.mean, prior.variance, posterior.mean, posterior.variance)
    const prediction = integratedEndpointPrediction(prior.mean, prior.variance, scoreA, scoreB)
    if (prediction === null) throw new RangeError('endpoint prediction failed')
    this.state = state
    this.clocks = [...recomputed.clocks]
    this.pending = null
    this.version += 1
    return Object.freeze({ latentMean: prior.mean, latentVariance: prior.variance, endpointProbability: prediction.endpointProbability, endpointNll: prediction.endpointNll })
  }

  discardPreparation(token: J1Preparation): void {
    if (this.pending === null || token !== this.pending.token || token.version !== this.version) {
      throw new RangeError('only the exact current J1 preparation can be discarded')
    }
    this.pending = null
  }

  detachedClose(activityId: number): J1CloseSnapshot {
    if (this.pending !== null || this.state.activeActivityId !== activityId) throw new RangeError('close snapshot requires active activity without preparation')
    const staged = this.state.clone()
    staged.close(activityId)
    const snapshot = staged.snapshot()
    return Object.freeze({ activityId, roster: snapshot.roster, mean: snapshot.mean, covariance: snapshot.covariance, clocks: Object.freeze([...this.clocks]) })
  }

  finishClose(activityId?: number): void {
    if (this.pending !== null) throw new RangeError('cannot close with a pending preparation')
    this.state.close(activityId)
  }

  private transition(view: J1PregameView): { state: DenseJ1State; clocks: (number | null)[]; deltas: number[] } {
    const staged = this.state.clone()
    closeCopy(staged, view.activityId)
    const nextClocks = [...this.clocks]
    const people = participants(view)
    const deltas = people.map((player) => {
      const index = staged.playerIndex(player)
      if (index === undefined) throw new RangeError('participant is not in time-zero roster')
      const previous = nextClocks[index]
      if (previous !== null && view.completedAtMinute < previous) throw new RangeError('participant time cannot move backwards')
      return previous === null ? 0 : (view.completedAtMinute - previous) / 10080
    })
    staged.addParticipantVariance(people, deltas.map((delta) => this.sigma ** 2 * delta))
    staged.open(view.activityId)
    for (const player of people) nextClocks[staged.playerIndex(player)!] = view.completedAtMinute
    return { state: staged, clocks: nextClocks, deltas }
  }

  private posterior(scoreA: number, scoreB: number, mean: number, variance: number): { mean: number; variance: number } {
    if (variance < 1e-15) return { mean, variance }
    const scale = Math.sqrt(2 * variance)
    const nodes = GAUSS_HERMITE_31.nodes.map((node) => mean + scale * node)
    const weights = nodes.map((node, index) => GAUSS_HERMITE_31.normalizedWeights[index] * endpointProbability(scoreA, scoreB, node))
    const normalizer = weights.reduce((sum, weight) => sum + weight, 0)
    if (!Number.isFinite(normalizer) || normalizer <= 0) throw new RangeError('endpoint likelihood projection underflowed')
    let posteriorMean = 0
    for (let index = 0; index < nodes.length; index += 1) posteriorMean += (weights[index] / normalizer) * nodes[index]
    let posteriorVariance = 0
    for (let index = 0; index < nodes.length; index += 1) posteriorVariance += (weights[index] / normalizer) * (nodes[index] - posteriorMean) ** 2
    if (!Number.isFinite(posteriorMean) || !Number.isFinite(posteriorVariance)) throw new RangeError('non-finite posterior moments')
    return { mean: posteriorMean, variance: Math.max(0, posteriorVariance) }
  }
}

import type { AttendanceEvent, Match, Session } from '../types'

export interface RotationParticipantState {
  present: boolean
  volunteerRest: boolean
  periodId?: string
  queuedReset: boolean
  eligibleMilliseconds: number
  appearances: number
  dailyAppearances: number
  ratePerHour: number
}

export type RotationProjection =
  | { status: 'valid'; participantStates: Record<string, RotationParticipantState> }
  | { status: 'degraded'; reason: string }

interface MutableState extends RotationParticipantState { eligibleSince?: number }
const degraded = (reason: string): RotationProjection => ({ status: 'degraded', reason })

/**
 * Deterministically replay immutable attendance records. A recovery boundary is
 * an authoritative suffix: invalid bytes before the final boundary remain raw
 * export data, but never affect post-repair projection.
 */
export function projectRotationState(
  session: Pick<Session, 'id' | 'participantIds' | 'presentIds' | 'leftIds'>,
  events: readonly AttendanceEvent[] | unknown,
  matches: readonly Match[],
  evaluationTime: number,
): RotationProjection {
  if (!Number.isFinite(evaluationTime) || !Array.isArray(events)) return degraded('invalid fairness data')
  const own = events.filter((event): event is AttendanceEvent => !!event && typeof event === 'object' && event.sessionId === session.id)
  if (own.some((event) => !Number.isFinite(event.at) || !Number.isInteger(event.sequence))) {
    return degraded('invalid attendance ordering')
  }
  const ordered = [...own].sort((a, b) => a.at - b.at || a.sequence - b.sequence)
  const lastBoundary = ordered.reduce((found, event, index) => event.kind === 'fairness-recovery-boundary' && !event.liveMatchId ? index : found, -1)
  const suffix = lastBoundary >= 0 ? ordered.slice(lastBoundary) : ordered
  const eventIds = new Set<string>()
  const sequences = new Set<number>()
  for (const event of suffix) {
    if (!event.id || eventIds.has(event.id) || sequences.has(event.sequence)) return degraded('duplicate or invalid attendance identity')
    eventIds.add(event.id); sequences.add(event.sequence)
  }
  for (let index = 1; index < suffix.length; index++) {
    if (suffix[index]!.sequence < suffix[index - 1]!.sequence) return degraded('non-monotonic attendance sequence')
  }
  const suffixStart = lastBoundary >= 0 ? ordered[lastBoundary]!.at : -Infinity
  const states: Record<string, MutableState> = {}
  const stateFor = (id: string) => (states[id] ??= { present: false, volunteerRest: false, queuedReset: false, eligibleMilliseconds: 0, appearances: 0, dailyAppearances: 0, ratePerHour: 0 })
  const close = (state: MutableState, at: number) => {
    if (state.eligibleSince !== undefined) {
      if (at < state.eligibleSince) throw new Error('negative eligible interval')
      state.eligibleMilliseconds += at - state.eligibleSince
      state.eligibleSince = undefined
    }
  }
  const open = (state: MutableState, at: number) => { if (state.present && !state.volunteerRest) state.eligibleSince = at }
  const knownPlayers = new Set([...(session.participantIds ?? []), ...(session.presentIds ?? []), ...(session.leftIds ?? [])])
  try {
    for (const event of suffix) {
      if (event.at > evaluationTime) return degraded('future attendance event')
      if (event.kind === 'fairness-recovery-boundary') {
        // A live-bound repair is a durable request, not an applied boundary.
        if (event.liveMatchId) continue
        if (!event.presentIds || !event.volunteerRestIds || new Set(event.presentIds).size !== event.presentIds.length || event.volunteerRestIds.some((id) => !event.presentIds!.includes(id))) return degraded('invalid recovery boundary')
        for (const key of Object.keys(states)) delete states[key]
        const resting = new Set(event.volunteerRestIds)
        for (const playerId of event.presentIds) {
          if (knownPlayers.size && !knownPlayers.has(playerId)) return degraded('unknown recovery participant')
          const state = stateFor(playerId)
          state.present = true; state.volunteerRest = resting.has(playerId); state.periodId = event.id
          open(state, event.at)
        }
        continue
      }
      if (!event.playerId || (knownPlayers.size && !knownPlayers.has(event.playerId))) return degraded('missing or unknown participant on attendance event')
      const state = stateFor(event.playerId)
      switch (event.kind) {
        case 'join':
          if (state.present) return degraded('duplicate join')
          state.present = true; open(state, event.at); break
        case 'leave':
          if (!state.present) return degraded('leave while absent')
          close(state, event.at); state.present = false; state.volunteerRest = false; break
        case 'voluntary-rest-start':
          if (!state.present || state.volunteerRest) return degraded('invalid rest start')
          close(state, event.at); state.volunteerRest = true; break
        case 'voluntary-rest-end':
          if (!state.present || !state.volunteerRest) return degraded('invalid rest end')
          state.volunteerRest = false; open(state, event.at); break
        case 'fairness-reset-requested':
          if (!state.present || state.queuedReset || !event.liveMatchId) return degraded('invalid reset request')
          state.queuedReset = true; break
        case 'fairness-period-started':
          if (!state.present) return degraded('period start while absent')
          close(state, event.at); state.periodId = event.id; state.eligibleMilliseconds = 0; state.appearances = 0; state.queuedReset = false; open(state, event.at); break
        default: return degraded('unknown attendance event kind')
      }
    }
    const periodEvents = new Map(suffix.filter((event) => event.kind === 'fairness-period-started' || (event.kind === 'fairness-recovery-boundary' && !event.liveMatchId)).map((event) => [event.id, event]))
    const attributedStateAt = (playerId: string, periodId: string, matchAt: number) => {
      const period = periodEvents.get(periodId)
      if (!period) return { present: false, volunteerRest: false, periodId: undefined as string | undefined }
      let present = false
      let volunteerRest = false
      let currentPeriodId: string | undefined
      for (const event of suffix) {
        if (event.at > matchAt || (event.at === matchAt && event.sequence > period.sequence)) break
        if (event.kind === 'fairness-recovery-boundary') {
          if (event.liveMatchId) continue
          present = event.presentIds?.includes(playerId) ?? false
          volunteerRest = present && (event.volunteerRestIds?.includes(playerId) ?? false)
          currentPeriodId = present ? event.id : undefined
          continue
        }
        if (event.playerId !== playerId) continue
        if (event.kind === 'join') { present = true; volunteerRest = false }
        else if (event.kind === 'leave') { present = false; volunteerRest = false }
        else if (event.kind === 'voluntary-rest-start') volunteerRest = true
        else if (event.kind === 'voluntary-rest-end') volunteerRest = false
        else if (event.kind === 'fairness-period-started') currentPeriodId = event.id
      }
      return { present, volunteerRest, periodId: currentPeriodId }
    }
    for (const match of matches) {
      if (match.sessionId !== session.id) continue
      const lineup = [...match.teamA, ...match.teamB]
      const hasUnknownLineupPlayer = knownPlayers.size > 0 && lineup.some((id) => !knownPlayers.has(id))
      if (new Set(lineup).size !== lineup.length || hasUnknownLineupPlayer) return degraded('invalid match lineup')
      for (const playerId of lineup) stateFor(playerId).dailyAppearances++
      const lineage = match.fairnessPeriodIds
      // Old pre-migration records are retained for daily totals only.
      if (!lineage) continue
      if (Object.keys(lineage).length !== lineup.length || lineup.some((id) => !lineage[id])) return degraded('incomplete match lineage')
      for (const [playerId, periodId] of Object.entries(lineage)) {
        if (!lineup.includes(playerId)) return degraded('lineage includes non-player')
        const period = periodEvents.get(periodId)
        // Prefix lineage is historical raw data after repair, not suffix authority.
        if (!period && match.at < suffixStart) continue
        if (!period || period.at > match.at) return degraded('unknown or future match period reference')
        const attributed = attributedStateAt(playerId, periodId, match.at)
        if (!attributed.present || attributed.volunteerRest || attributed.periodId !== periodId) return degraded('match player was not eligible in attributed period')
        if (states[playerId]?.periodId === periodId) states[playerId]!.appearances++
      }
    }
    for (const state of Object.values(states)) {
      if (state.eligibleSince !== undefined) close(state, evaluationTime)
      state.ratePerHour = state.eligibleMilliseconds === 0 ? 0 : state.appearances * 3_600_000 / state.eligibleMilliseconds
    }
    return { status: 'valid', participantStates: states }
  } catch (error) {
    return degraded((error as Error).message)
  }
}

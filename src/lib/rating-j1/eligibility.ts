/**
 * Descriptive preflight for the frozen imported strict history only.
 * It deliberately neither adapts product records nor creates rating state.
 */
export type StrictEligibilityReason =
  | 'VARIABLE_GAME_COUNT'
  | 'INCOMPLETE_PREFIX'
  | 'SINGLES_UNSUPPORTED'
  | 'MISSING_SCORING_FORMAT'
  | 'DYNAMIC_ROSTER'
  | 'UNSUPPORTED_SCORING_FORMAT'
  | 'DUPLICATE_EVENT_IDENTITY'
  | 'CHRONOLOGY_FAILURE'
  | 'INVALID_TEAM_COMPOSITION'
  | 'ILLEGAL_ENDPOINT'

/** This exported order is the stable, deduplicated report order. */
export const STRICT_ELIGIBILITY_REASON_ORDER: readonly StrictEligibilityReason[] = Object.freeze([
  'VARIABLE_GAME_COUNT',
  'INCOMPLETE_PREFIX',
  'SINGLES_UNSUPPORTED',
  'MISSING_SCORING_FORMAT',
  'DYNAMIC_ROSTER',
  'UNSUPPORTED_SCORING_FORMAT',
  'DUPLICATE_EVENT_IDENTITY',
  'CHRONOLOGY_FAILURE',
  'INVALID_TEAM_COMPOSITION',
  'ILLEGAL_ENDPOINT',
])

/** A local DTO: callers map their records explicitly; no store or product authority is imported. */
export interface StrictEligibilityFormat {
  readonly targetPoints: number
  readonly winBy: number
  readonly capPoints: number
}

export interface StrictEligibilityEvent {
  readonly eventId: string
  readonly completedAtMinute: number
  readonly activityId: number
  readonly gameIndex: number
  readonly activityAttendees: readonly unknown[]
  readonly teamA: readonly unknown[]
  readonly teamB: readonly unknown[]
  readonly mode?: 'doubles' | 'singles'
  /** Product-shaped input may carry an explicit format snapshot here. */
  readonly format?: StrictEligibilityFormat
  /** Imported strict fixtures carry the same explicit snapshot in flat fields. */
  readonly targetPoints?: number
  readonly winBy?: number
  readonly capPoints?: number
  readonly scoreA: number
  readonly scoreB: number
}

export interface StrictEligibilityInput {
  readonly timeZeroRoster: readonly unknown[]
  readonly events: readonly StrictEligibilityEvent[]
}

export interface StrictEligibilityReport {
  readonly eligible: boolean
  readonly reasons: readonly StrictEligibilityReason[]
}

const EXPECTED_ACTIVITY_COUNT = 144
const EXPECTED_GAMES_PER_ACTIVITY = 12
const EXPECTED_EVENT_COUNT = EXPECTED_ACTIVITY_COUNT * EXPECTED_GAMES_PER_ACTIVITY

function isStrictRoster(roster: readonly unknown[]): roster is readonly number[] {
  return roster.length >= 4 && roster.every((player) => Number.isSafeInteger(player)) && new Set(roster).size === roster.length
}

function sameIdentity(left: unknown, right: unknown): boolean {
  return left === right
}

function isRosterBound(values: readonly unknown[], roster: readonly unknown[]): boolean {
  return values.every((player) => roster.some((member) => sameIdentity(member, player)))
}

function distinctPair(team: readonly unknown[]): boolean {
  return team.length === 2 && !sameIdentity(team[0], team[1])
}

function validDoublesComposition(event: StrictEligibilityEvent): boolean {
  const players = [...event.teamA, ...event.teamB]
  return distinctPair(event.teamA)
    && distinctPair(event.teamB)
    && new Set(players).size === 4
    && new Set(event.activityAttendees).size === event.activityAttendees.length
    && players.every((player) => event.activityAttendees.some((attendee) => sameIdentity(attendee, player)))
}

function strictFormat(event: StrictEligibilityEvent): StrictEligibilityFormat | undefined {
  if (event.format !== undefined) return event.format
  if (event.targetPoints === undefined || event.winBy === undefined || event.capPoints === undefined) return undefined
  return { targetPoints: event.targetPoints, winBy: event.winBy, capPoints: event.capPoints }
}

function isFrozenFormat(format: StrictEligibilityFormat): boolean {
  return format.targetPoints === 15 && format.winBy === 2 && format.capPoints === 21
}

function hasConflictingFormatRepresentations(event: StrictEligibilityEvent): boolean {
  if (event.format === undefined) return false
  const flat = [event.targetPoints, event.winBy, event.capPoints]
  if (flat.every((value) => value === undefined)) return false
  return event.targetPoints !== event.format.targetPoints
    || event.winBy !== event.format.winBy
    || event.capPoints !== event.format.capPoints
}

function isLegalStrictEndpoint(scoreA: number, scoreB: number): boolean {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return false
  const winner = Math.max(scoreA, scoreB)
  const loser = Math.min(scoreA, scoreB)
  if (winner === 15) return loser >= 0 && loser <= 13
  if (winner >= 16 && winner <= 20) return loser === winner - 2
  return winner === 21 && (loser === 19 || loser === 20)
}

function isStrictlyChronological(events: readonly StrictEligibilityEvent[]): boolean {
  for (let index = 1; index < events.length; index += 1) {
    const before = events[index - 1]
    const after = events[index]
    const beforeKey = [before.completedAtMinute, before.activityId, before.gameIndex, before.eventId] as const
    const afterKey = [after.completedAtMinute, after.activityId, after.gameIndex, after.eventId] as const
    for (let position = 0; position < beforeKey.length; position += 1) {
      if (beforeKey[position] < afterKey[position]) break
      if (beforeKey[position] > afterKey[position]) return false
      if (position === beforeKey.length - 1) return false
    }
  }
  return true
}

/**
 * Assess compatibility with the frozen strict import contract. This is only a
 * pure description of incompatibilities: it never guesses format from score,
 * normalizes teams, splits sessions, invents covariance, or changes its input.
 */
export function assessStrictEligibility(input: StrictEligibilityInput): StrictEligibilityReport {
  const found = new Set<StrictEligibilityReason>()
  const { timeZeroRoster: roster, events } = input
  if (!isStrictRoster(roster)) found.add('DYNAMIC_ROSTER')

  const expectedSlots = new Set<string>()
  for (let activity = 0; activity < EXPECTED_ACTIVITY_COUNT; activity += 1) {
    for (let game = 0; game < EXPECTED_GAMES_PER_ACTIVITY; game += 1) expectedSlots.add(`${activity}:${game}`)
  }
  const observedSlots = new Set(events.map((event) => `${event.activityId}:${event.gameIndex}`))
  const activityCounts = Array.from({ length: EXPECTED_ACTIVITY_COUNT }, () => 0)
  for (const event of events) if (Number.isInteger(event.activityId) && event.activityId >= 0 && event.activityId < EXPECTED_ACTIVITY_COUNT) activityCounts[event.activityId] += 1
  if (events.length !== EXPECTED_EVENT_COUNT || activityCounts.some((count) => count !== EXPECTED_GAMES_PER_ACTIVITY)) found.add('VARIABLE_GAME_COUNT')
  if (events.length !== EXPECTED_EVENT_COUNT || observedSlots.size !== EXPECTED_EVENT_COUNT || [...expectedSlots].some((slot) => !observedSlots.has(slot))) found.add('INCOMPLETE_PREFIX')

  const identities = new Set<string>()
  for (const event of events) {
    if (event.eventId.length === 0 || identities.has(event.eventId)) found.add('DUPLICATE_EVENT_IDENTITY')
    identities.add(event.eventId)
    const singles = event.mode === 'singles' || event.teamA.length === 1 || event.teamB.length === 1
    if (singles) found.add('SINGLES_UNSUPPORTED')
    else if (!validDoublesComposition(event)) found.add('INVALID_TEAM_COMPOSITION')
    if (!isRosterBound(event.activityAttendees, roster) || !isRosterBound(event.teamA, roster) || !isRosterBound(event.teamB, roster) || event.activityAttendees.length !== roster.length || event.activityAttendees.some((player, index) => !sameIdentity(player, roster[index]))) found.add('DYNAMIC_ROSTER')
    const format = strictFormat(event)
    if (format === undefined) found.add('MISSING_SCORING_FORMAT')
    else if (!isFrozenFormat(format) || hasConflictingFormatRepresentations(event)) found.add('UNSUPPORTED_SCORING_FORMAT')
    if (!isLegalStrictEndpoint(event.scoreA, event.scoreB)) found.add('ILLEGAL_ENDPOINT')
  }
  if (!isStrictlyChronological(events)) found.add('CHRONOLOGY_FAILURE')

  const reasons = Object.freeze(STRICT_ELIGIBILITY_REASON_ORDER.filter((reason) => found.has(reason)))
  return Object.freeze({ eligible: reasons.length === 0, reasons })
}

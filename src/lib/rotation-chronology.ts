import type { Match, Session } from '../types'

export function isPositiveCompletionSequence(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) > 0
    && (value as number) < Number.MAX_SAFE_INTEGER
}

export function assertValidCompletionChronology(
  session: Pick<Session, 'id' | 'nextCompletionSequence'>,
  matches: readonly Pick<Match, 'sessionId' | 'completionSequence'>[],
): void {
  const own = matches.filter((match) => match.sessionId === session.id)
  const sequences = own.map((match) => match.completionSequence)
  if (sequences.some((sequence) => !isPositiveCompletionSequence(sequence))) {
    throw new Error('completion sequence must be a positive integer for every session match')
  }
  if (new Set(sequences).size !== sequences.length) {
    throw new Error('completion sequence must be unique within its session')
  }
  const maximum = sequences.length === 0 ? 0 : Math.max(...(sequences as number[]))
  if (
    !isPositiveCompletionSequence(session.nextCompletionSequence) ||
    session.nextCompletionSequence <= maximum
  ) {
    throw new Error('completion sequence high-water mark must be a positive integer above every existing sequence')
  }
}

export function orderMatchesByCompletionSequence<T extends Pick<Match, 'sessionId' | 'completionSequence'>>(
  matches: readonly T[],
  sessionId: string,
): T[] {
  const own = matches.filter((match) => match.sessionId === sessionId)
  const syntheticSession = {
    id: sessionId,
    nextCompletionSequence:
      Math.max(0, ...own.map((match) => match.completionSequence ?? 0)) + 1,
  }
  assertValidCompletionChronology(syntheticSession, own)
  return [...own].sort(
    (left, right) => left.completionSequence! - right.completionSequence!,
  )
}

export function twoRoundsAgoActualPlayingIds(
  matches: readonly Match[],
  sessionId: string,
): string[] | undefined {
  const ordered = orderMatchesByCompletionSequence(matches, sessionId)
  const twoRoundsAgo = ordered.at(-2)
  return twoRoundsAgo
    ? [...twoRoundsAgo.teamA, ...twoRoundsAgo.teamB]
    : undefined
}

export function migrateLegacyCompletionChronology(
  session: Session,
  matchesInOriginalPersistedOrder: readonly Match[],
): void {
  const own = matchesInOriginalPersistedOrder.filter(
    (match) => match.sessionId === session.id,
  )
  const allSequencesMissing = own.every(
    (match) => match.completionSequence === undefined,
  )
  if (session.nextCompletionSequence === undefined && allSequencesMissing) {
    const originalOrder = new Map(own.map((match, index) => [match, index]))
    const ordered = [...own].sort(
      (left, right) =>
        left.at - right.at || originalOrder.get(left)! - originalOrder.get(right)!,
    )
    ordered.forEach((match, index) => {
      match.completionSequence = index + 1
    })
    session.nextCompletionSequence = ordered.length + 1
    return
  }
  assertValidCompletionChronology(session, own)
}

export function allocateCompletionSequence(
  session: Pick<Session, 'nextCompletionSequence'>,
): number {
  if (!isPositiveCompletionSequence(session.nextCompletionSequence)) {
    throw new Error('completion sequence high-water mark is missing or invalid')
  }
  const allocated = session.nextCompletionSequence
  const next = allocated + 1
  if (!isPositiveCompletionSequence(next)) {
    throw new Error('completion sequence high-water mark cannot be advanced safely')
  }
  session.nextCompletionSequence = next
  return allocated
}

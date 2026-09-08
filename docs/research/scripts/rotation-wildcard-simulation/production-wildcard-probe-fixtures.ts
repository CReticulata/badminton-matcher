const FORMAT = { schemaVersion: 1, kind: 'unknown', reason: 'explicit-unknown' } as const

interface ProbeFixtureOptions {
  mode: 'singles' | 'doubles'
  ids: readonly string[]
  completedPlayingSets: readonly (readonly string[])[]
}

function fixture({ mode, ids, completedPlayingSets }: ProbeFixtureOptions) {
  const events: Record<string, unknown>[] = []
  for (const id of ids) {
    const at = id === 'e' ? 3_599_000 : 0
    for (const kind of ['join', 'fairness-period-started']) {
      events.push({
        id: `${id}-${kind}`,
        sessionId: 'probe-session',
        playerId: id,
        kind,
        at,
        sequence: events.length,
      })
    }
  }
  const matches = completedPlayingSets.map((playing, index) => ({
    id: `probe-match-${index + 1}`,
    sessionId: 'probe-session',
    at: index === 0 ? 1_000 : 3_600_000,
    completionSequence: index + 1,
    mode,
    teamA: playing.slice(0, mode === 'doubles' ? 2 : 1),
    teamB: playing.slice(mode === 'doubles' ? 2 : 1),
    scoreA: 21,
    scoreB: 10,
    resters: ids.filter((id) => !playing.includes(id)),
    scoringFormat: FORMAT,
    fairnessPeriodIds: Object.fromEntries(
      playing.map((id) => [id, `${id}-fairness-period-started`]),
    ),
  }))
  return {
    players: ids.map((id) => ({
      id,
      name: id.toUpperCase(),
      color: '#a7f3d0',
      rating: 1500,
      initialRating: 1500,
      rd: 350,
      vol: 0.06,
      createdAt: 0,
    })),
    sessions: [{
      id: 'probe-session',
      name: 'Built-app behavior probe',
      startedAt: 0,
      nextCompletionSequence: 3,
      rotationWildcardCooldownRemaining: 0,
      openingRatings: Object.fromEntries(ids.map((id) => [id, { rating: 1500, rd: 350, vol: 0.06 }])),
      participantIds: [...ids],
      participantOrderReliable: true,
      addedDuringSessionIds: [],
      presentIds: [...ids],
      leftIds: [],
      volunteerRest: [],
      active: true,
      defaultScoringFormat: FORMAT,
      attendanceEvents: events,
    }],
    matches,
    overrides: [],
    baselines: [],
  }
}

export const PRODUCTION_WILDCARD_PROBE_CASES = [
  {
    name: 'doubles' as const,
    mode: 'doubles' as const,
    fixture: fixture({
      mode: 'doubles',
      ids: ['a', 'b', 'c', 'd', 'e'],
      completedPlayingSets: [
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'c', 'e'],
      ],
    }),
  },
  {
    name: 'singles' as const,
    mode: 'singles' as const,
    fixture: fixture({
      mode: 'singles',
      ids: ['a', 'b', 'e'],
      completedPlayingSets: [
        ['a', 'b'],
        ['a', 'e'],
      ],
    }),
  },
] as const

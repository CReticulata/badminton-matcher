import { describe, expect, it } from 'vitest'
import strictFixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-selector-surface.json?raw'
import contractText from '../../../../docs/features/j1-pwa-method-contract.md?raw'
import { STRICT_ELIGIBILITY_REASON_ORDER, assessStrictEligibility, type StrictEligibilityInput } from '../eligibility'

type StrictFixture = { input: { roster: number[]; prefix: StrictEligibilityInput['events'] } }
const strictFixture = JSON.parse(strictFixtureText) as StrictFixture
const strictInput: StrictEligibilityInput = Object.freeze({
  timeZeroRoster: strictFixture.input.roster,
  events: strictFixture.input.prefix,
})

function productHistory(gameCount: number, overrides: Partial<StrictEligibilityInput> = {}): StrictEligibilityInput {
  const roster = [0, 1, 2, 3]
  return {
    timeZeroRoster: roster,
    events: Array.from({ length: gameCount }, (_, gameIndex) => ({
      eventId: `product-${gameIndex}`,
      completedAtMinute: gameIndex,
      activityId: 0,
      gameIndex,
      activityAttendees: roster,
      teamA: [0, 1],
      teamB: [2, 3],
      mode: 'doubles',
      format: { targetPoints: 15, winBy: 2, capPoints: 21 },
      scoreA: 15,
      scoreB: 10,
    })),
    ...overrides,
  }
}

function expectReasons(input: StrictEligibilityInput, reasons: readonly string[]): void {
  expect(assessStrictEligibility(input).reasons).toEqual(reasons)
}

describe('strict J1 eligibility preflight', () => {
  it('keeps the PWA-native contract requirements-only and separate from strict evidence', () => {
    expect(contractText).toMatch(/^---\nartifact_contract: ce-unified-plan\/v1\nartifact_readiness: requirements-only\nproduct_contract_source: ce-plan-bootstrap\n---/)
    expect(contractText).toContain('# PWA-Adaptable Rating (PAR) method contract')
    expect(contractText).toContain('## Goal Capsule')
    expect(contractText).toContain('### Requirements')
    expect(contractText).toContain('### Unresolved blockers')
    expect(contractText).toContain('### Promotion evidence')
    expect(contractText).toContain('Glicko remains the sole product rating and matchmaking authority.')
    expect(contractText).toContain('93-world evidence is nonformal and exploratory')
    for (const prohibited of ['implementation-ready', 'migration design', 'authority approval', 'cutover']) expect(contractText).not.toContain(prohibited)
  })

  it('accepts the imported strict selector fixture without changing it', () => {
    const before = strictFixtureText
    const deepBefore = structuredClone(strictFixture)
    const report = assessStrictEligibility(strictInput)
    expect(report).toEqual({ eligible: true, reasons: [] })
    expect(strictFixtureText).toBe(before)
    expect(strictFixture).toEqual(deepBefore)
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.reasons)).toBe(true)
  })

  it.each([5, 7, 9])('describes a product-shaped %i-game doubles session as variable and incomplete', (gameCount) => {
    expectReasons(productHistory(gameCount), ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX'])
  })

  it('does not infer a 15/2/21 format from a score that looks like one', () => {
    const history = productHistory(1, { events: [{ ...productHistory(1).events[0], format: undefined }] })
    expectReasons(history, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'MISSING_SCORING_FORMAT'])
  })

  it('describes singles, unsupported formats, and roster changes without constructing state', () => {
    const base = productHistory(1).events[0]
    const history = productHistory(1, {
      events: [
        { ...base, mode: 'singles', teamA: [0], teamB: [1], format: { targetPoints: 21, winBy: 2, capPoints: 30 } },
        { ...base, eventId: 'late-entrant', gameIndex: 1, completedAtMinute: 1, activityAttendees: [0, 1, 2, 3, 4], teamA: [0, 4] },
      ],
    })
    expectReasons(history, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'SINGLES_UNSUPPORTED', 'DYNAMIC_ROSTER', 'UNSUPPORTED_SCORING_FORMAT'])
    expectReasons(productHistory(2, { events: [base, { ...base, eventId: 'roster-change', gameIndex: 1, completedAtMinute: 1, activityAttendees: [1, 0, 2, 3] }] }), [
      'VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DYNAMIC_ROSTER',
    ])
  })

  it('rejects overlapping teams, players absent from attendees, and conflicting format snapshots', () => {
    const base = productHistory(1).events[0]
    expectReasons(productHistory(1, { events: [{ ...base, teamA: [0, 1], teamB: [1, 2] }] }), [
      'VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'INVALID_TEAM_COMPOSITION',
    ])
    expectReasons(productHistory(1, { events: [{ ...base, activityAttendees: [0, 1, 2], teamB: [2, 3] }] }), [
      'VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DYNAMIC_ROSTER', 'INVALID_TEAM_COMPOSITION',
    ])
    expectReasons(productHistory(1, { events: [{ ...base, targetPoints: 21, winBy: 2, capPoints: 30 }] }), [
      'VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'UNSUPPORTED_SCORING_FORMAT',
    ])
  })

  it('reports duplicate identity and chronological failure in the stable order', () => {
    const first = productHistory(1).events[0]
    const history = productHistory(2, {
      events: [first, { ...first, completedAtMinute: 0 }],
    })
    expectReasons(history, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DUPLICATE_EVENT_IDENTITY', 'CHRONOLOGY_FAILURE'])
  })

  it('executes every row of the U9 fixed product-shaped eligibility matrix independently', () => {
    const singles = productHistory(5, {
      events: productHistory(5).events.map((event) => ({ ...event, mode: 'singles', teamA: [0], teamB: [1] })),
    })
    const missingFormat = productHistory(5, {
      events: productHistory(5).events.map((event) => ({ ...event, format: undefined })),
    })
    const lateEntrant = productHistory(5, {
      events: productHistory(5).events.map((event, index) => index === 4 ? { ...event, activityAttendees: [0, 1, 2, 3, 4], teamA: [0, 4] } : event),
    })
    const newlyCreatedPlayer = productHistory(5, {
      events: productHistory(5).events.map((event, index) => index === 4 ? { ...event, activityAttendees: [0, 1, 2, 3, 5], teamB: [2, 5] } : event),
    })
    const rosterChange = productHistory(5, {
      events: productHistory(5).events.map((event, index) => index === 4 ? { ...event, activityAttendees: [1, 0, 2, 3] } : event),
    })

    const matrix: ReadonlyArray<readonly [string, StrictEligibilityInput, readonly string[]]> = [
      ['5-game doubles', productHistory(5), ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX']],
      ['7-game doubles', productHistory(7), ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX']],
      ['9-game doubles', productHistory(9), ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX']],
      ['singles', singles, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'SINGLES_UNSUPPORTED']],
      ['missing format', missingFormat, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'MISSING_SCORING_FORMAT']],
      ['late entrant', lateEntrant, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DYNAMIC_ROSTER']],
      ['newly created player', newlyCreatedPlayer, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DYNAMIC_ROSTER']],
      ['roster change', rosterChange, ['VARIABLE_GAME_COUNT', 'INCOMPLETE_PREFIX', 'DYNAMIC_ROSTER']],
      ['strict control', strictInput, []],
    ]

    expect(matrix.map(([name, input]) => [name, assessStrictEligibility(input)])).toEqual(
      matrix.map(([name, , reasons]) => [name, { eligible: reasons.length === 0, reasons }]),
    )
  })

  it('dedupes combined reasons in its documented deterministic order', () => {
    const malformed = productHistory(1, {
      timeZeroRoster: [0, 0, 1],
      events: [{
        ...productHistory(1).events[0],
        eventId: '',
        mode: 'singles',
        teamA: [0],
        teamB: [1],
        activityAttendees: [0, 1, 2, 4],
        format: undefined,
        scoreA: 15,
        scoreB: 10,
      }],
    })
    const report = assessStrictEligibility(malformed)
    expect(report.reasons).toEqual([
      'VARIABLE_GAME_COUNT',
      'INCOMPLETE_PREFIX',
      'SINGLES_UNSUPPORTED',
      'MISSING_SCORING_FORMAT',
      'DYNAMIC_ROSTER',
      'DUPLICATE_EVENT_IDENTITY',
    ])
    expect(report.reasons).toEqual([...new Set(report.reasons)])
    expect(STRICT_ELIGIBILITY_REASON_ORDER).toEqual([
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
  })
})

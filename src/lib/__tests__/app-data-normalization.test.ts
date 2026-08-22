import { describe, expect, it } from 'vitest'
import { normalizeAppData } from '../app-data-normalization'

const legacy = {
  players: [],
  sessions: [{ id: 's', name: '21 points', startedAt: 1, presentIds: [], leftIds: [], volunteerRest: [], active: true }],
  matches: [{ id: 'm', sessionId: 's', at: 2, mode: 'singles', teamA: ['a'], teamB: ['b'], scoreA: 21, scoreB: 19, resters: [] }],
  overrides: [], baselines: [],
}

const catalog = { schemaVersion: 1, kind: 'catalog', formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: { target: 21, winBy: 2, cap: 30 } }
const custom = { schemaVersion: 1, kind: 'custom', label: 'Club 11', rules: { target: 11, winBy: 2, cap: 15 } }
const explicitUnknown = { schemaVersion: 1, kind: 'unknown', reason: 'explicit-unknown' }

describe('app data scoring-format normalization', () => {
  it('marks only truly absent legacy fields as detached legacy unknowns without inference', () => {
    const fullyLegacy = normalizeAppData(legacy)
    expect(fullyLegacy.sessions[0]!.defaultScoringFormat).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing' })
    expect(fullyLegacy.matches[0]!.scoringFormat).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing' })
    expect(fullyLegacy.sessions[0]!.defaultScoringFormat).not.toBe(fullyLegacy.matches[0]!.scoringFormat)
    expect(Object.isFrozen(fullyLegacy.sessions[0]!.defaultScoringFormat)).toBe(true)
    expect(Object.isFrozen(fullyLegacy.matches[0]!.scoringFormat)).toBe(true)

    const resemblingLaterDefault = {
      ...legacy,
      sessions: [{ ...legacy.sessions[0], name: 'Badminton 21', startedAt: 999, defaultScoringFormat: explicitUnknown }],
      matches: [{ ...legacy.matches[0], scoreA: 21, scoreB: 19, at: 123456 }],
    }

    const normalized = normalizeAppData(resemblingLaterDefault)
    expect(normalized.sessions[0]!.defaultScoringFormat).toEqual(explicitUnknown)
    expect(normalized.matches[0]!.scoringFormat).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing' })
    expect(normalized.sessions[0]!.defaultScoringFormat).not.toBe(normalized.matches[0]!.scoringFormat)
  })

  it('rejects malformed declared snapshots and illegal structured historical endpoints as the whole value', () => {
    expect(() => normalizeAppData({ ...legacy, sessions: [{ ...legacy.sessions[0], defaultScoringFormat: { kind: 'unknown' } }] })).toThrow()
    expect(() => normalizeAppData({ ...legacy, matches: [{ ...legacy.matches[0], scoringFormat: catalog, scoreA: 21, scoreB: 20 }] })).toThrow()
  })

  it('rejects malformed core entities instead of casting them into typed reactive state', () => {
    expect(() => normalizeAppData({ ...legacy, players: [{ id: 7 }] })).toThrow()
    expect(() => normalizeAppData({ ...legacy, sessions: [{ ...legacy.sessions[0], active: 'yes' }] })).toThrow()
    expect(() => normalizeAppData({ ...legacy, matches: [{ ...legacy.matches[0], mode: 'triples' }] })).toThrow()
    expect(() => normalizeAppData({ ...legacy, overrides: [{ id: 'o', playerId: 'p', rating: 1500, at: 'later' }] })).toThrow()
    expect(() => normalizeAppData({ ...legacy, baselines: [{ id: 'b', playerId: 'p', rating: 1500, rd: 200, vol: Number.NaN, at: 1 }] })).toThrow()
  })

  it('round-trips mixed explicit variants without aliases', () => {
    const normalized = normalizeAppData({
      ...legacy,
      sessions: [
        { ...legacy.sessions[0], id: 'catalog-session', defaultScoringFormat: catalog },
        { ...legacy.sessions[0], id: 'custom-session', defaultScoringFormat: custom },
        { ...legacy.sessions[0], id: 'unknown-session', defaultScoringFormat: explicitUnknown },
      ],
      matches: [
        { ...legacy.matches[0], id: 'catalog-match', sessionId: 'catalog-session', scoringFormat: catalog },
        { ...legacy.matches[0], id: 'custom-match', sessionId: 'custom-session', scoreA: 11, scoreB: 9, scoringFormat: custom },
        { ...legacy.matches[0], id: 'unknown-match', sessionId: 'unknown-session', scoringFormat: explicitUnknown },
      ],
    })

    expect(normalized.sessions.map((session: { defaultScoringFormat: { kind: string } }) => session.defaultScoringFormat.kind)).toEqual(['catalog', 'custom', 'unknown'])
    expect(normalized.matches.map((match: { scoringFormat: { kind: string } }) => match.scoringFormat.kind)).toEqual(['catalog', 'custom', 'unknown'])
    expect(normalized.sessions[0]!.defaultScoringFormat).toEqual(catalog)
    expect(normalized.matches[0]!.scoringFormat).toEqual(catalog)
    expect(normalized.sessions[0]!.defaultScoringFormat).not.toBe(normalized.matches[0]!.scoringFormat)
    expect((normalized.sessions[0]!.defaultScoringFormat as typeof catalog).rules).not.toBe((normalized.matches[0]!.scoringFormat as typeof catalog).rules)
  })
})

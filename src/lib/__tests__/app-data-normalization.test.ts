import { describe, expect, it } from 'vitest'
import { normalizeAppData } from '../app-data-normalization'
import { createCatalogSnapshot, createCustomSnapshot, createUnknownSnapshot } from '../scoring-format'

const player = {
  id: 'p1', name: 'A', color: '#000', rating: 1500, rd: 350, vol: 0.06,
  initialRating: 1500, createdAt: 1,
}
const legacySession = {
  id: 's1', name: '場次', startedAt: 10, presentIds: ['p1'], leftIds: [], volunteerRest: [], active: false,
}
const legacyMatch = {
  id: 'm1', sessionId: 's1', at: 20, mode: 'doubles', teamA: ['p1'], teamB: ['p2'],
  scoreA: 15, scoreB: 12, resters: [],
}
const base = (over: Record<string, unknown> = {}) => ({
  players: [player], sessions: [legacySession], matches: [legacyMatch],
  overrides: [], baselines: [], ...over,
})

describe('缺少賽制欄位的舊資料', () => {
  it('活動與比賽都補成 legacy-missing', () => {
    const out = normalizeAppData(base())
    expect(out.sessions[0]!.defaultScoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
    expect(out.matches[0]!.scoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
  })

  it('比分剛好只在一種目錄賽制下合法時仍維持未知，不回填', () => {
    // 15:12 在 15/2/21 下合法、在 21/2/30 下不合法，但仍不得推斷
    const out = normalizeAppData(base())
    expect(out.matches[0]!.scoringFormat.kind).toBe('unknown')
  })

  it('保留所有既有欄位', () => {
    const raw = base({
      players: [{ ...player, archivedAt: 99 }],
      sessions: [{
        ...legacySession,
        participantIds: ['p1'], participantOrderReliable: false,
        addedDuringSessionIds: ['p1'], endedAt: 50,
        openingRatings: { p1: { rating: 1500, rd: 350, vol: 0.06 } },
      }],
      overrides: [{ id: 'o1', playerId: 'p1', rating: 1400, at: 5 }],
      baselines: [{ id: 'b1', playerId: 'p1', rating: 1400, rd: 200, vol: 0.06, at: 6 }],
    })
    const out = normalizeAppData(raw)
    expect(out.players[0]!.archivedAt).toBe(99)
    expect(out.sessions[0]).toMatchObject({
      participantIds: ['p1'], participantOrderReliable: false,
      addedDuringSessionIds: ['p1'], endedAt: 50,
      openingRatings: { p1: { rating: 1500, rd: 350, vol: 0.06 } },
    })
    expect(out.overrides).toHaveLength(1)
    expect(out.baselines).toHaveLength(1)
  })

  it('archivedAt 為 0 視為存在（0 是合法 timestamp）', () => {
    const out = normalizeAppData(base({ players: [{ ...player, archivedAt: 0 }] }))
    expect(out.players[0]!.archivedAt).toBe(0)
  })
})

describe('已宣告的賽制快照', () => {
  it('合法的 catalog／custom／unknown 都原樣重建', () => {
    const cat = createCatalogSnapshot('badminton-15-w2-c21')
    const cus = createCustomSnapshot('友誼賽', { target: 11, winBy: 1, cap: 11 })
    const out = normalizeAppData(base({
      sessions: [{ ...legacySession, defaultScoringFormat: JSON.parse(JSON.stringify(cus)) }],
      matches: [{ ...legacyMatch, scoringFormat: JSON.parse(JSON.stringify(cat)) }],
    }))
    expect(out.sessions[0]!.defaultScoringFormat).toEqual(cus)
    expect(out.matches[0]!.scoringFormat).toEqual(cat)
  })

  it('格式錯誤的宣告值直接 throw，不降級成 unknown', () => {
    expect(() => normalizeAppData(base({
      matches: [{ ...legacyMatch, scoringFormat: { schemaVersion: 1, kind: 'catalog' } }],
    }))).toThrow()
    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, defaultScoringFormat: { kind: 'unknown' } }],
    }))).toThrow()
  })

  it('目錄規則被竄改時 throw', () => {
    expect(() => normalizeAppData(base({
      matches: [{
        ...legacyMatch,
        scoringFormat: {
          schemaVersion: 1, kind: 'catalog', formatId: 'badminton-15-w2-c21',
          formatVersion: 1, rules: { target: 15, winBy: 2, cap: 99 },
        },
      }],
    }))).toThrow()
  })
})

describe('結構化快照與已存比分矛盾', () => {
  it('比分在該賽制下不合法時整批拒絕', () => {
    expect(() => normalizeAppData(base({
      matches: [{
        ...legacyMatch, scoreA: 15, scoreB: 14,
        scoringFormat: JSON.parse(JSON.stringify(createCatalogSnapshot('badminton-15-w2-c21'))),
      }],
    }))).toThrow()
  })

  it('unknown 快照不套用結構化檢查', () => {
    expect(() => normalizeAppData(base({
      matches: [{
        ...legacyMatch, scoreA: 99, scoreB: 1,
        scoringFormat: JSON.parse(JSON.stringify(createUnknownSnapshot('explicit-unknown'))),
      }],
    }))).not.toThrow()
  })

  it('活動預設賽制不對既有比賽套用檢查', () => {
    // 預設是 21 分制，但既有比賽是 15:12 的 legacy 未知 —— 不得因預設而失敗
    expect(() => normalizeAppData(base({
      sessions: [{
        ...legacySession,
        defaultScoringFormat: JSON.parse(JSON.stringify(createCatalogSnapshot('badminton-21-w2-c30'))),
      }],
    }))).not.toThrow()
  })
})

describe('rotation wildcard lineage normalization', () => {
  const rotationWildcard = {
    schemaVersion: 1,
    normalPlayingIds: ['a', 'b', 'c', 'd'],
    exchangedOutId: 'a',
    exchangedInId: 'e',
  }
  const liveMatch = {
    mode: 'doubles',
    teamA: ['b', 'c'],
    teamB: ['d', 'e'],
    resters: ['a'],
    scoringFormat: createUnknownSnapshot('explicit-unknown'),
    liveMatchId: 'live',
    startedAt: 20,
    rotationWildcard,
  }

  it('preserves and revalidates valid live and completed lineage', () => {
    const completed = {
      ...legacyMatch,
      mode: 'doubles', teamA: ['b', 'c'], teamB: ['d', 'e'], resters: ['a'],
      completionSequence: 1,
      rotationWildcard,
    }
    const out = normalizeAppData(base({
      sessions: [{
        ...legacySession, active: true, nextCompletionSequence: 2, liveMatch,
      }],
      matches: [completed],
    }))
    expect(out.sessions[0]!.liveMatch?.rotationWildcard).toEqual(rotationWildcard)
    expect(out.matches[0]!.rotationWildcard).toEqual(rotationWildcard)
  })

  it('rejects present null lineage for both live and completed records', () => {
    expect(() => normalizeAppData(base({
      sessions: [{
        ...legacySession, active: true, nextCompletionSequence: 1,
        liveMatch: { ...liveMatch, rotationWildcard: null as never },
      }],
      matches: [],
    }))).toThrow(/rotationWildcard/)

    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, nextCompletionSequence: 2 }],
      matches: [{
        ...legacyMatch,
        mode: 'doubles', teamA: ['b', 'c'], teamB: ['d', 'e'], resters: ['a'],
        completionSequence: 1,
        rotationWildcard: null as never,
      }],
    }))).toThrow(/rotationWildcard/)
  })

  it('blocks impossible final-set equality after reload for live and completed records', () => {
    expect(() => normalizeAppData(base({
      sessions: [{
        ...legacySession, active: true, nextCompletionSequence: 1,
        liveMatch: { ...liveMatch, teamA: ['b', 'f'] },
      }],
      matches: [],
    }))).toThrow(/rotation wildcard/i)

    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, nextCompletionSequence: 2 }],
      matches: [{
        ...legacyMatch,
        mode: 'doubles', teamA: ['b', 'f'], teamB: ['d', 'e'], resters: ['a'],
        completionSequence: 1,
        rotationWildcard,
      }],
    }))).toThrow(/rotation wildcard/i)
  })
  it('blocks unknown versions, duplicate IDs, wrong mode size, and membership errors', () => {
    const cases = [
      { ...rotationWildcard, schemaVersion: 2 },
      { ...rotationWildcard, normalPlayingIds: ['a', 'a', 'c', 'd'] },
      { ...rotationWildcard, normalPlayingIds: ['a', 'b'] },
      { ...rotationWildcard, exchangedOutId: 'z' },
      { ...rotationWildcard, exchangedInId: 'b' },
      { ...rotationWildcard, exchangedInId: '' },
    ]
    for (const invalid of cases) {
      expect(() => normalizeAppData(base({
        sessions: [{ ...legacySession, nextCompletionSequence: 2 }],
        matches: [{
          ...legacyMatch,
          mode: 'doubles', teamA: ['b', 'c'], teamB: ['d', 'e'], resters: ['a'],
          completionSequence: 1,
          rotationWildcard: invalid,
        }],
      }))).toThrow(/rotation wildcard/i)
    }
  })

  it('does not infer wildcard origin from unusual legacy lineups', () => {
    const out = normalizeAppData(base({
      matches: [{ ...legacyMatch, teamA: ['x', 'y'], teamB: ['z'], resters: ['p1'] }],
    }))
    expect(out.matches[0]!.rotationWildcard).toBeUndefined()
  })
})

describe('rotation wildcard cooldown normalization', () => {
  it('defaults missing legacy cooldown to zero', () => {
    const out = normalizeAppData(base({ sessions: [{ ...legacySession, active: true }] }))
    expect(out.sessions[0]!.rotationWildcardCooldownRemaining).toBe(0)
  })

  it.each([-1, 3, 1.5, Number.NaN, '2'])('rejects present invalid cooldown %s', (value) => {
    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, rotationWildcardCooldownRemaining: value }],
    }))).toThrow(/cooldown/i)
  })

  it.each([0, 1, 2])('preserves valid cooldown %s', (value) => {
    const out = normalizeAppData(base({
      sessions: [{ ...legacySession, rotationWildcardCooldownRemaining: value }],
    }))
    expect(out.sessions[0]!.rotationWildcardCooldownRemaining).toBe(value)
  })
})

describe('completion chronology normalization', () => {
  it('allows wholly missing legacy chronology for migration', () => {
    expect(() => normalizeAppData(base())).not.toThrow()
  })

  it.each([
    { label: 'present match sequence without high-water', session: {}, sequences: [1] },
    { label: 'high-water with a missing match sequence', session: { nextCompletionSequence: 2 }, sequences: [undefined] },
    { label: 'non-positive sequence', session: { nextCompletionSequence: 2 }, sequences: [0] },
    { label: 'non-integer sequence', session: { nextCompletionSequence: 2 }, sequences: [1.5] },
    { label: 'duplicate sequence', session: { nextCompletionSequence: 2 }, sequences: [1, 1] },
    { label: 'stale high-water', session: { nextCompletionSequence: 1 }, sequences: [1] },
  ])('rejects $label', ({ session, sequences }) => {
    const matches = sequences.map((completionSequence, index) => ({
      ...legacyMatch,
      id: `m${index}`,
      ...(completionSequence === undefined ? {} : { completionSequence }),
    }))
    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, ...session }],
      matches,
    }))).toThrow(/completion sequence/i)
  })
})

describe('causal timestamp normalization', () => {
  it('rejects timestamps that cannot be safely advanced by one millisecond', () => {
    const unsafe = Number.MAX_SAFE_INTEGER
    expect(() => normalizeAppData(base({
      sessions: [{ ...legacySession, startedAt: unsafe }],
    }))).toThrow(/timestamp/i)
    expect(() => normalizeAppData(base({
      matches: [{ ...legacyMatch, at: unsafe }],
    }))).toThrow(/timestamp/i)
    expect(() => normalizeAppData(base({
      sessions: [{
        ...legacySession,
        attendanceEvents: [{
          id: 'e', sessionId: legacySession.id, kind: 'join', playerId: 'p1',
          at: unsafe, sequence: 0,
        }],
      }],
    }))).toThrow(/timestamp/i)
    expect(() => normalizeAppData(base({
      sessions: [{
        ...legacySession, active: true,
        liveMatch: {
          mode: 'singles', teamA: ['p1'], teamB: ['p2'], resters: [],
          scoringFormat: createUnknownSnapshot('explicit-unknown'),
          liveMatchId: 'live', startedAt: unsafe,
        },
      }],
      matches: [],
    }))).toThrow(/timestamp/i)
  })
})

describe('頂層結構', () => {
  it('缺少的陣列補成空陣列', () => {
    const out = normalizeAppData({ players: [player] })
    expect(out.sessions).toEqual([])
    expect(out.matches).toEqual([])
    expect(out.overrides).toEqual([])
    expect(out.baselines).toEqual([])
  })

  it('非物件或陣列欄位型別錯誤時 throw', () => {
    expect(() => normalizeAppData(null)).toThrow()
    expect(() => normalizeAppData('x')).toThrow()
    expect(() => normalizeAppData({ players: 'x' })).toThrow()
  })
})

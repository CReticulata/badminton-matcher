import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv } from '../csv'
import type { AppData } from '../../types'
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_FIELD_BYTES,
  IMPORT_MAX_RECORDS,
} from '../csv'
import {
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
} from '../scoring-format'
import { projectRotationState } from '../rotation-fairness'

/** 既有測試不驗證賽制，統一使用明確未知（維持原本的寬鬆比分規則） */
const TEST_FORMAT = createUnknownSnapshot('explicit-unknown')

const sample: AppData = {
  players: [
    {
      id: 'p1',
      name: '小明, "特別"',
      color: '#ef4444',
      rating: 1512.345,
      rd: 290.1,
      vol: 0.06,
      initialRating: 1500,
      createdAt: 1000,
    },
    {
      id: 'p2',
      name: '阿華',
      color: '#3b82f6',
      rating: 1488,
      rd: 300,
      vol: 0.06,
      initialRating: 1300,
      createdAt: 1001,
      archivedAt: 0,
    },
  ],
  sessions: [
    {
      id: 's1',
      name: '2026/8/5 場次',
      startedAt: 2000,
      openingRatings: {
        p1: { rating: 1500, rd: 350, vol: 0.06 },
        p2: { rating: 1300, rd: 350, vol: 0.06 },
      },
      participantIds: ['p1', 'p2'],
      participantOrderReliable: false,
      addedDuringSessionIds: [],
      presentIds: ['p1', 'p2'],
      leftIds: [],
      volunteerRest: ['p2'],
      active: true, defaultScoringFormat: TEST_FORMAT,
    },
  ],
  matches: [
    {
      id: 'm1',
      sessionId: 's1',
      at: 3000,
      mode: 'doubles',
      teamA: ['p1', 'p2'],
      teamB: ['p1', 'p2'],
      scoreA: 21,
      scoreB: 15,
      resters: ['p1'], scoringFormat: TEST_FORMAT,
    },
  ],
  overrides: [{ id: 'o1', playerId: 'p1', rating: 1800, at: 2500 }],
  baselines: [
    { id: 'b1', playerId: 'p2', rating: 1495.5, rd: 200.25, vol: 0.059, at: 3500 },
  ],
}

describe('CSV 匯出/匯入', () => {
  it('round-trip 後資料一致（含逗號與引號跳脫）', () => {
    const csv = exportCsv(sample)
    const back = importCsv(csv)
    expect(back).toEqual(sample)
  })

  it('名字含換行時 round-trip 後資料一致', () => {
    const data: AppData = {
      ...sample,
      players: [{ ...sample.players[0]!, name: 'Smith, "The Ace"\n第二行' }, sample.players[1]!],
    }
    const back = importCsv(exportCsv(data))
    expect(back).toEqual(data)
  })

  it('相容沒有 participantOrderReliable 欄位的舊 session CSV', () => {
    const legacy = [
      '[players]',
      'id,name,color,rating,rd,vol,initialRating,createdAt',
      'p1,小明,#ef4444,1500,350,0.06,1500,1000',
      '[sessions]',
      'id,name,startedAt,endedAt,presentIds,leftIds,volunteerRest,active,participantIds,addedDuringSessionIds,openingRatings',
      's1,舊活動,2000,3000,p1,,,false,p1,,',
    ].join('\n')

    const back = importCsv(legacy)
    expect(back.sessions[0]!.participantIds).toEqual(['p1'])
    expect(back.sessions[0]!.participantOrderReliable).toBeUndefined()
  })

  it('空內容或格式錯誤會 throw', () => {
    expect(() => importCsv('')).toThrow()
    expect(() => importCsv('id,name\n1,x')).toThrow()
  })
})

// ---------- 賽制快照 ----------

describe('CSV 賽制欄位', () => {
  const withFormats = (): AppData => {
    const d = JSON.parse(JSON.stringify(sample)) as AppData
    d.sessions[0]!.defaultScoringFormat = createCatalogSnapshot('badminton-15-w2-c21')
    d.matches[0]!.scoringFormat = createCustomSnapshot('友誼賽，含逗號', { target: 11, winBy: 1, cap: 11 })
    return d
  }

  it('catalog／custom／unknown 都能 round-trip', () => {
    const out = importCsv(exportCsv(withFormats()))
    expect(out.sessions[0]!.defaultScoringFormat).toEqual(createCatalogSnapshot('badminton-15-w2-c21'))
    expect(out.matches[0]!.scoringFormat).toEqual(createCustomSnapshot('友誼賽，含逗號', { target: 11, winBy: 1, cap: 11 }))
  })

  it('round-trip 同時保留既有欄位', () => {
    const out = importCsv(exportCsv(withFormats()))
    expect(out.sessions[0]!.openingRatings).toEqual(sample.sessions[0]!.openingRatings)
    expect(out.sessions[0]!.participantOrderReliable).toBe(sample.sessions[0]!.participantOrderReliable)
    expect(out.players[0]!.archivedAt).toBe(sample.players[0]!.archivedAt)
    expect(out.overrides).toEqual(sample.overrides)
    expect(out.baselines).toEqual(sample.baselines)
  })

  it('缺少賽制欄位的舊備份載入為 legacy-missing', () => {
    // 升級前匯出的真實檔案形狀：sessions／matches 標頭都沒有賽制欄位
    const legacy = [
      '[players]',
      'id,name,color,rating,rd,vol,initialRating,createdAt,archivedAt',
      'p1,甲,#111111,1500,350,0.06,1500,1000,',
      '[sessions]',
      'id,name,startedAt,endedAt,presentIds,leftIds,volunteerRest,active',
      's1,舊活動,2000,3000,p1,,,false',
      '[matches]',
      'id,sessionId,at,mode,teamA,teamB,scoreA,scoreB,resters',
      'm1,s1,2500,doubles,p1,p1,15,12,',
    ].join('\n')
    const out = importCsv(legacy)
    expect(out.matches[0]!.scoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
    expect(out.sessions[0]!.defaultScoringFormat).toEqual(createUnknownSnapshot('legacy-missing'))
  })

  it('賽制欄位有值但解不開時整批拒絕', () => {
    const csv = exportCsv(withFormats()).replace('"{""schemaVersion""', '"{""bogus""')
    expect(() => importCsv(csv)).toThrow()
  })
})

describe('CSV fairness lineage', () => {
  it('round-trips deterministic attendance rows and explicit match period lineage', () => {
    const data: AppData = JSON.parse(JSON.stringify(sample))
    data.sessions[0]!.attendanceEvents = [
      { id: 'e2', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p1', at: 0, sequence: 1 },
      { id: 'e1', sessionId: 's1', kind: 'join', playerId: 'p1', at: 0, sequence: 0 },
      { id: 'e4', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p2', at: 0, sequence: 3 },
      { id: 'e3', sessionId: 's1', kind: 'join', playerId: 'p2', at: 0, sequence: 2 },
    ]
    data.matches[0]!.teamA = ['p1']
    data.matches[0]!.teamB = ['p2']
    data.matches[0]!.fairnessPeriodIds = { p1: 'e2', p2: 'e4' }
    data.sessions[0]!.liveMatch = {
      mode: 'singles', teamA: ['p1'], teamB: ['p2'], resters: [],
      scoringFormat: createUnknownSnapshot('explicit-unknown'),
      liveMatchId: 'live-1', startedAt: 10, fairnessPeriodIds: { p1: 'e2', p2: 'e4' },
    }
    const csv = exportCsv(data)
    expect(csv).toContain('fairnessPeriodIds')
    const back = importCsv(csv)
    expect(back.matches[0]!.fairnessPeriodIds).toEqual({ p1: 'e2', p2: 'e4' })
    expect(back.sessions[0]!.liveMatch).toEqual(data.sessions[0]!.liveMatch)
    expect(back.sessions[0]!.attendanceEvents?.map((event) => [event.id, event.sequence])).toEqual([['e1', 0], ['e2', 1], ['e3', 2], ['e4', 3]])
  })

  it('rejects attendance references to unknown players and invalid match lineage', () => {
    const data: AppData = JSON.parse(JSON.stringify(sample))
    data.sessions[0]!.attendanceEvents = [{ id: 'e', sessionId: 's1', kind: 'join', playerId: 'missing', at: 0, sequence: 0 }]
    expect(() => importCsv(exportCsv(data))).toThrow(/未知球員/)
  })

  it('rejects non-integer sequences and cross-session period lineage atomically', () => {
    const data: AppData = JSON.parse(JSON.stringify(sample))
    data.sessions[0]!.attendanceEvents = [
      { id: 'e1', sessionId: 's1', kind: 'join', playerId: 'p1', at: 0, sequence: 0 },
      { id: 'e2', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p1', at: 0, sequence: 1 },
      { id: 'e3', sessionId: 's1', kind: 'join', playerId: 'p2', at: 0, sequence: 2 },
      { id: 'e4', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p2', at: 0, sequence: 3 },
    ]
    data.matches[0]!.teamA = ['p1']
    data.matches[0]!.teamB = ['p2']
    data.matches[0]!.fairnessPeriodIds = { p1: 'e2', p2: 'e4' }
    const csv = exportCsv(data)
    expect(() => importCsv(csv.replace(',join,p1,0,0,', ',join,p1,0,0.5,'))).toThrow(/整數/)

    const second = { ...JSON.parse(JSON.stringify(data.sessions[0]!)), id: 's2', name: 's2', active: false, attendanceEvents: undefined }
    data.sessions.push(second)
    second.attendanceEvents = [
      { id: 's2-join', sessionId: 's2', kind: 'join', playerId: 'p1', at: 0, sequence: 0 },
      { id: 's2-period', sessionId: 's2', kind: 'fairness-period-started', playerId: 'p1', at: 0, sequence: 1 },
    ]
    data.matches[0]!.fairnessPeriodIds = { p1: 's2-period', p2: 'e4' }
    expect(() => importCsv(exportCsv(data))).toThrow(/lineage/)
  })

  it('preserves the fixed-time projector result and rejects an unknown authoritative event kind', () => {
    const data: AppData = JSON.parse(JSON.stringify(sample))
    data.sessions[0]!.attendanceEvents = [
      { id: 'e1', sessionId: 's1', kind: 'join', playerId: 'p1', at: 0, sequence: 0 },
      { id: 'e2', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p1', at: 0, sequence: 1 },
      { id: 'e3', sessionId: 's1', kind: 'join', playerId: 'p2', at: 0, sequence: 2 },
      { id: 'e4', sessionId: 's1', kind: 'fairness-period-started', playerId: 'p2', at: 0, sequence: 3 },
    ]
    data.matches[0]!.teamA = ['p1']
    data.matches[0]!.teamB = ['p2']
    data.matches[0]!.fairnessPeriodIds = { p1: 'e2', p2: 'e4' }
    const roundTrip = importCsv(exportCsv(data))
    const at = 7_200_000
    expect(projectRotationState(roundTrip.sessions[0]!, roundTrip.sessions[0]!.attendanceEvents!, roundTrip.matches, at)).toEqual(
      projectRotationState(data.sessions[0]!, data.sessions[0]!.attendanceEvents!, data.matches, at),
    )
    expect(() => importCsv(exportCsv(data).replace(',join,p1,0,0,', ',not-an-event,p1,0,0,'))).toThrow()
  })
})

describe('CSV 結構損毀', () => {
  it('已知區段重複時拒絕', () => {
    expect(() => importCsv(exportCsv(sample) + '\n[matches]\nid,sessionId\nx,y')).toThrow(/區段重複/)
  })

  it('欄位名稱重複時拒絕', () => {
    const csv = exportCsv(sample).replace('id,sessionId,at,mode', 'id,id,at,mode')
    expect(() => importCsv(csv)).toThrow(/欄位名稱重複/)
  })

  it('資料列欄位數與標頭不符時拒絕', () => {
    const lines = exportCsv(sample).split('\n')
    const i = lines.findIndex((l) => l.startsWith('m1,'))
    lines[i] = lines[i] + ',多出來的欄位'
    expect(() => importCsv(lines.join('\n'))).toThrow(/欄位數/)
  })

  it('未知區段仍可忽略（向前相容）', () => {
    expect(() => importCsv(exportCsv(sample) + '\n[future]\na,b\n1,2')).not.toThrow()
  })
})

describe('CSV 匯入上限', () => {
  it('超過位元組上限時拒絕', () => {
    const csv = exportCsv(sample) + '\n[pad]\nx\n' + 'a'.repeat(IMPORT_MAX_BYTES)
    expect(() => importCsv(csv)).toThrow(/MiB/)
  })

  it('超過列數上限時拒絕', () => {
    const csv = exportCsv(sample) + '\n[pad]\nx\n' + 'y\n'.repeat(IMPORT_MAX_RECORDS + 1)
    expect(() => importCsv(csv)).toThrow(/列上限/)
  })

  it('單一欄位超過上限時拒絕', () => {
    const csv = exportCsv(sample) + '\n[pad]\nx\n' + 'z'.repeat(IMPORT_MAX_FIELD_BYTES + 1)
    expect(() => importCsv(csv)).toThrow(/KiB/)
  })
})

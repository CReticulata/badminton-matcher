import { describe, expect, it } from 'vitest'
import {
  SCORING_FORMAT_CATALOG,
  cloneScoringFormat,
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
  displayScoringFormat,
  encodeScoringFormat,
  isLegalEndpoint,
  isStructured,
  reconstructScoringFormat,
} from '../scoring-format'

describe('catalog 快照', () => {
  it('兩個目錄項目綁定固定 id、版本與規則', () => {
    expect(SCORING_FORMAT_CATALOG.map((e) => e.formatId)).toEqual([
      'badminton-21-w2-c30',
      'badminton-15-w2-c21',
    ])
    expect(createCatalogSnapshot('badminton-21-w2-c30').rules).toEqual({ target: 21, winBy: 2, cap: 30 })
    expect(createCatalogSnapshot('badminton-15-w2-c21').rules).toEqual({ target: 15, winBy: 2, cap: 21 })
  })

  it('保存複製的規則與版本，不是只存 id', () => {
    const snap = createCatalogSnapshot('badminton-15-w2-c21')
    expect(snap).toMatchObject({ schemaVersion: 1, kind: 'catalog', formatVersion: 1 })
    expect(JSON.parse(encodeScoringFormat(snap)).rules).toEqual({ target: 15, winBy: 2, cap: 21 })
  })

  it('回傳的快照與巢狀 rules 都不可變更', () => {
    const snap = createCatalogSnapshot('badminton-21-w2-c30')
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.rules)).toBe(true)
  })

  it('不存在的目錄 id 被拒絕', () => {
    expect(() => createCatalogSnapshot('badminton-11-w2-c15' as never)).toThrow()
  })
})

describe('custom 快照', () => {
  it('保留 trim 後的標籤與規則，且沒有 catalog 身分', () => {
    const snap = createCustomSnapshot('  友誼賽  ', { target: 11, winBy: 1, cap: 11 })
    expect(snap).toEqual({
      schemaVersion: 1,
      kind: 'custom',
      label: '友誼賽',
      rules: { target: 11, winBy: 1, cap: 11 },
    })
    expect('formatId' in snap).toBe(false)
  })

  it('標籤長度以 Unicode code point 計，1–40 之外拒絕', () => {
    expect(() => createCustomSnapshot('', { target: 11, winBy: 1, cap: 11 })).toThrow()
    expect(() => createCustomSnapshot('   ', { target: 11, winBy: 1, cap: 11 })).toThrow()
    expect(() => createCustomSnapshot('🏸'.repeat(40), { target: 11, winBy: 1, cap: 11 })).not.toThrow()
    expect(() => createCustomSnapshot('🏸'.repeat(41), { target: 11, winBy: 1, cap: 11 })).toThrow()
  })
})

describe('unknown 快照', () => {
  it('兩種 provenance 各自可建立且不含規則', () => {
    for (const reason of ['explicit-unknown', 'legacy-missing'] as const) {
      const snap = createUnknownSnapshot(reason)
      expect(snap).toEqual({ schemaVersion: 1, kind: 'unknown', reason })
      expect('rules' in snap).toBe(false)
    }
  })

  it('未知的 reason 被拒絕', () => {
    expect(() => createUnknownSnapshot('guessed' as never)).toThrow()
  })
})

describe('規則驗證', () => {
  const bad = [
    ['target 缺失', { winBy: 2, cap: 30 }],
    ['非整數', { target: 21.5, winBy: 2, cap: 30 }],
    ['零', { target: 0, winBy: 2, cap: 30 }],
    ['負數', { target: 21, winBy: -2, cap: 30 }],
    ['非有限', { target: Number.POSITIVE_INFINITY, winBy: 2, cap: 30 }],
    ['winBy > target', { target: 2, winBy: 3, cap: 30 }],
    ['cap < target', { target: 21, winBy: 2, cap: 20 }],
    ['多餘欄位', { target: 21, winBy: 2, cap: 30, extra: 1 }],
    ['數字字串', { target: '21', winBy: 2, cap: 30 }],
  ] as const
  for (const [name, rules] of bad) {
    it(`拒絕：${name}`, () => {
      expect(() => createCustomSnapshot('x', rules as never)).toThrow()
    })
  }

  it('接受 cap === target', () => {
    expect(() => createCustomSnapshot('一局定勝負', { target: 11, winBy: 2, cap: 11 })).not.toThrow()
  })
})

describe('reconstructScoringFormat', () => {
  it('三種 variant 都能還原', () => {
    for (const snap of [
      createCatalogSnapshot('badminton-15-w2-c21'),
      createCustomSnapshot('友誼賽', { target: 11, winBy: 1, cap: 11 }),
      createUnknownSnapshot('legacy-missing'),
    ]) {
      expect(reconstructScoringFormat(JSON.parse(encodeScoringFormat(snap)))).toEqual(snap)
    }
  })

  const malformed: [string, unknown][] = [
    ['null', null],
    ['字串', 'catalog'],
    ['陣列', []],
    ['未知 kind', { schemaVersion: 1, kind: 'guess' }],
    ['缺 schemaVersion', { kind: 'unknown', reason: 'legacy-missing' }],
    ['錯誤 schemaVersion', { schemaVersion: 2, kind: 'unknown', reason: 'legacy-missing' }],
    ['unknown 帶規則', { schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing', rules: { target: 21, winBy: 2, cap: 30 } }],
    ['catalog 缺 rules', { schemaVersion: 1, kind: 'catalog', formatId: 'badminton-21-w2-c30', formatVersion: 1 }],
    ['catalog 多餘欄位', { schemaVersion: 1, kind: 'catalog', formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: { target: 21, winBy: 2, cap: 30 }, label: 'x' }],
    ['custom 帶 formatId', { schemaVersion: 1, kind: 'custom', label: 'x', rules: { target: 11, winBy: 1, cap: 11 }, formatId: 'badminton-21-w2-c30' }],
  ]
  for (const [name, value] of malformed) {
    it(`拒絕：${name}`, () => {
      expect(() => reconstructScoringFormat(value)).toThrow()
    })
  }

  it('catalog 規則與該版本不符時拒絕，不靜默改寫', () => {
    expect(() =>
      reconstructScoringFormat({
        schemaVersion: 1,
        kind: 'catalog',
        formatId: 'badminton-21-w2-c30',
        formatVersion: 1,
        rules: { target: 15, winBy: 2, cap: 21 },
      }),
    ).toThrow()
  })

  it('cloneScoringFormat 產生等值但獨立的快照', () => {
    const snap = createCatalogSnapshot('badminton-21-w2-c30')
    const copy = cloneScoringFormat(snap)
    expect(copy).toEqual(snap)
    expect(copy).not.toBe(snap)
    expect(copy.kind === 'catalog' && copy.rules).not.toBe(snap.rules)
  })
})

describe('isLegalEndpoint（21/2/30）', () => {
  const fmt = createCatalogSnapshot('badminton-21-w2-c30')
  const legal: [number, number][] = [
    [21, 0], [21, 19], [22, 20], [25, 23], [29, 27], [30, 28], [30, 29],
  ]
  const illegal: [number, number][] = [
    [21, 20], [21, 21], [20, 18], [22, 19], [22, 21], [30, 27], [31, 29], [15, 12], [-1, 0], [21, -1],
  ]
  for (const [a, b] of legal) {
    it(`合法 ${a}:${b}`, () => {
      expect(isLegalEndpoint(fmt, a, b)).toBe(true)
      expect(isLegalEndpoint(fmt, b, a)).toBe(true)
    })
  }
  for (const [a, b] of illegal) {
    it(`不合法 ${a}:${b}`, () => {
      expect(isLegalEndpoint(fmt, a, b)).toBe(false)
      expect(isLegalEndpoint(fmt, b, a)).toBe(false)
    })
  }
})

describe('isLegalEndpoint（15/2/21，本專案既有歷史的賽制）', () => {
  const fmt = createCatalogSnapshot('badminton-15-w2-c21')
  it('接受實際紀錄中出現過的終局', () => {
    for (const [a, b] of [[15, 7], [15, 13], [17, 15], [15, 0]] as const) {
      expect(isLegalEndpoint(fmt, a, b)).toBe(true)
    }
  })
  it('拒絕 15:14 與 21:18', () => {
    expect(isLegalEndpoint(fmt, 15, 14)).toBe(false)
    expect(isLegalEndpoint(fmt, 21, 18)).toBe(false)
  })
  it('接受 21:19 與 21:20（觸頂）', () => {
    expect(isLegalEndpoint(fmt, 21, 19)).toBe(true)
    expect(isLegalEndpoint(fmt, 21, 20)).toBe(true)
  })
})

describe('isLegalEndpoint（cap === target）', () => {
  const fmt = createCustomSnapshot('一局定勝負', { target: 11, winBy: 2, cap: 11 })
  it('只接受 target 分支', () => {
    expect(isLegalEndpoint(fmt, 11, 9)).toBe(true)
    expect(isLegalEndpoint(fmt, 11, 10)).toBe(false)
    expect(isLegalEndpoint(fmt, 12, 10)).toBe(false)
  })
})

describe('isLegalEndpoint（unknown）', () => {
  const fmt = createUnknownSnapshot('legacy-missing')
  it('維持既有寬鬆規則：不等的非負整數', () => {
    expect(isLegalEndpoint(fmt, 15, 7)).toBe(true)
    expect(isLegalEndpoint(fmt, 99, 1)).toBe(true)
    expect(isLegalEndpoint(fmt, 3, 3)).toBe(false)
    expect(isLegalEndpoint(fmt, -1, 0)).toBe(false)
    expect(isLegalEndpoint(fmt, 1.5, 0)).toBe(false)
  })
  it('不宣稱結構化資格', () => {
    expect(isStructured(fmt)).toBe(false)
    expect(isStructured(createCatalogSnapshot('badminton-21-w2-c30'))).toBe(true)
    expect(isStructured(createCustomSnapshot('x', { target: 11, winBy: 1, cap: 11 }))).toBe(true)
  })
})

describe('encode / display', () => {
  it('編碼為固定欄位順序的 canonical JSON', () => {
    expect(encodeScoringFormat(createCatalogSnapshot('badminton-15-w2-c21'))).toBe(
      '{"schemaVersion":1,"kind":"catalog","formatId":"badminton-15-w2-c21","formatVersion":1,"rules":{"target":15,"winBy":2,"cap":21}}',
    )
    expect(encodeScoringFormat(createUnknownSnapshot('legacy-missing'))).toBe(
      '{"schemaVersion":1,"kind":"unknown","reason":"legacy-missing"}',
    )
  })

  it('顯示字串區分 legacy 與明確未知', () => {
    expect(displayScoringFormat(createUnknownSnapshot('legacy-missing'))).not.toBe(
      displayScoringFormat(createUnknownSnapshot('explicit-unknown')),
    )
    expect(displayScoringFormat(createCustomSnapshot('友誼賽', { target: 11, winBy: 1, cap: 11 }))).toContain('友誼賽')
  })
})

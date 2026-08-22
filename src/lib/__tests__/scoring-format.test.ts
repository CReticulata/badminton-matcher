import { describe, expect, it } from 'vitest'
import {
  SCORING_FORMAT_CATALOG,
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
  displayScoringFormat,
  encodeScoringFormat,
  isLegalEndpoint,
  reconstructScoringFormat,
} from '../scoring-format'

describe('scoring format snapshots', () => {
  it('creates the two versioned catalog entries as detached deeply frozen snapshots', () => {
    expect(SCORING_FORMAT_CATALOG).toEqual([
      { formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: { target: 21, winBy: 2, cap: 30 } },
      { formatId: 'badminton-15-w2-c21', formatVersion: 1, rules: { target: 15, winBy: 2, cap: 21 } },
    ])
    const source = { target: 21, winBy: 2, cap: 30 }
    const snapshot = createCatalogSnapshot('badminton-21-w2-c30')
    expect(snapshot).toEqual({ schemaVersion: 1, kind: 'catalog', formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: source })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.rules)).toBe(true)
    expect(() => { ;(snapshot.rules as { target: number }).target = 99 }).toThrow()
    source.target = 99
    expect(snapshot.rules.target).toBe(21)
  })

  it('creates exact custom and unknown variants without aliasing', () => {
    const rules = { target: 11, winBy: 2, cap: 15 }
    const custom = createCustomSnapshot('  ✨ 自訂 A  ', rules)
    const explicitUnknown = createUnknownSnapshot('explicit-unknown')
    const legacyUnknown = createUnknownSnapshot('legacy-missing')
    rules.cap = 99
    expect(custom).toEqual({ schemaVersion: 1, kind: 'custom', label: '✨ 自訂 A', rules: { target: 11, winBy: 2, cap: 15 } })
    expect(explicitUnknown).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'explicit-unknown' })
    expect(legacyUnknown).toEqual({ schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing' })
    expect(Object.isFrozen(custom)).toBe(true)
    expect(Object.isFrozen(custom.rules)).toBe(true)
    expect(Object.isFrozen(explicitUnknown)).toBe(true)
    expect(() => { ;(custom.rules as { cap: number }).cap = 99 }).toThrow()
    expect(() => { ;(explicitUnknown as { reason: string }).reason = 'legacy-missing' }).toThrow()
  })

  it('reconstructs only exact schema fields and types', () => {
    const valid = { schemaVersion: 1, kind: 'catalog', formatId: 'badminton-21-w2-c30', formatVersion: 1, rules: { target: 21, winBy: 2, cap: 30 } }
    expect(reconstructScoringFormat(valid)).toEqual(valid)
    const reconstructed = reconstructScoringFormat(valid)
    expect(reconstructed).not.toBe(valid)
    if (reconstructed.kind !== 'catalog') throw new Error('expected catalog')
    expect(reconstructed.rules).not.toBe(valid.rules)
    expect(Object.isFrozen(reconstructed)).toBe(true)
    expect(Object.isFrozen(reconstructed.rules)).toBe(true)
    expect(() => { ;(reconstructed.rules as { target: number }).target = 99 }).toThrow()
    expect(reconstructed.rules.target).toBe(21)

    const customSource = { schemaVersion: 1, kind: 'custom', label: 'Club 11', rules: { target: 11, winBy: 2, cap: 15 } }
    const reconstructedCustom = reconstructScoringFormat(customSource)
    expect(reconstructedCustom).toEqual(customSource)
    expect(reconstructedCustom).not.toBe(customSource)
    if (reconstructedCustom.kind !== 'custom') throw new Error('expected custom')
    expect(reconstructedCustom.rules).not.toBe(customSource.rules)
    expect(Object.isFrozen(reconstructedCustom)).toBe(true)
    expect(Object.isFrozen(reconstructedCustom.rules)).toBe(true)
    customSource.rules.cap = 99
    expect(reconstructedCustom.rules.cap).toBe(15)

    for (const reason of ['explicit-unknown', 'legacy-missing'] as const) {
      const unknownSource = { schemaVersion: 1, kind: 'unknown', reason }
      const reconstructedUnknown = reconstructScoringFormat(unknownSource)
      expect(reconstructedUnknown).toEqual(unknownSource)
      expect(reconstructedUnknown).not.toBe(unknownSource)
      expect(Object.isFrozen(reconstructedUnknown)).toBe(true)
      expect(() => { ;(reconstructedUnknown as { reason: string }).reason = 'changed' }).toThrow()
    }

    for (const invalid of [
      { ...valid, extra: true },
      { ...valid, schemaVersion: '1' },
      { ...valid, schemaVersion: true },
      { ...valid, formatVersion: 1.5 },
      { ...valid, formatVersion: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, rules: { target: 21, winBy: 2, cap: 30, extra: 1 } },
      { ...valid, rules: { target: 21, winBy: true, cap: 30 } },
      { ...valid, rules: { target: 21, winBy: 2, cap: 29 } },
      { schemaVersion: 1, kind: 'unknown', reason: 'legacy-missing', rules: { target: 21, winBy: 2, cap: 30 } },
      { schemaVersion: 2, kind: 'unknown', reason: 'legacy-missing' },
    ]) expect(() => reconstructScoringFormat(invalid)).toThrow()
  })

  it('enforces custom Unicode labels and safe-integer rule boundaries', () => {
    expect(createCustomSnapshot('a'.repeat(40), { target: 1, winBy: 1, cap: 1 })).toBeDefined()
    for (const label of ['', '   ', 'a'.repeat(41)]) expect(() => createCustomSnapshot(label, { target: 1, winBy: 1, cap: 1 })).toThrow()
    for (const rules of [
      { target: 0, winBy: 1, cap: 1 }, { target: 1, winBy: 2, cap: 2 }, { target: 2, winBy: 1, cap: 1 },
      { target: 1.5, winBy: 1, cap: 2 }, { target: Number.MAX_SAFE_INTEGER + 1, winBy: 1, cap: Number.MAX_SAFE_INTEGER + 1 },
    ]) expect(() => createCustomSnapshot('x', rules)).toThrow()
  })

  it('encodes canonical JSON and labels each provenance variant', () => {
    const catalog = createCatalogSnapshot('badminton-21-w2-c30')
    expect(encodeScoringFormat(catalog)).toBe('{"schemaVersion":1,"kind":"catalog","formatId":"badminton-21-w2-c30","formatVersion":1,"rules":{"target":21,"winBy":2,"cap":30}}')
    expect(displayScoringFormat(catalog)).toContain('21')
    expect(displayScoringFormat(createCustomSnapshot('Night rules', { target: 11, winBy: 2, cap: 15 }))).toContain('Night rules')
    expect(displayScoringFormat(createUnknownSnapshot('legacy-missing'))).toMatch(/unknown|未知/i)
  })

  it('partitions target, deuce, and cap endpoints symmetrically including cap equal target', () => {
    const format = createCustomSnapshot('test', { target: 21, winBy: 2, cap: 30 })
    for (const [a, b, legal] of [[21, 19, true], [21, 20, false], [22, 20, true], [22, 19, false], [29, 27, true], [30, 28, true], [30, 27, false], [31, 29, false]] as const) {
      expect(isLegalEndpoint(format, a, b)).toBe(legal)
      expect(isLegalEndpoint(format, b, a)).toBe(legal)
    }
    const noDeuce = createCustomSnapshot('one', { target: 1, winBy: 1, cap: 1 })
    expect(isLegalEndpoint(noDeuce, 1, 0)).toBe(true)
    expect(isLegalEndpoint(noDeuce, 1, 1)).toBe(false)
    expect(isLegalEndpoint(createUnknownSnapshot('explicit-unknown'), 9007199254740992, 1)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { exportCsv, importCsv } from '../csv'
import {
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
  encodeScoringFormat,
} from '../scoring-format'
import type { AppData } from '../../types'

const catalog = createCatalogSnapshot('badminton-21-w2-c30')
const custom = createCustomSnapshot('社團, "週三"\n夜場', { target: 11, winBy: 2, cap: 15 })
const unknown = createUnknownSnapshot('explicit-unknown')

const sample: AppData = {
  players: [
    { id: 'p1', name: '小明, "特別"', color: '#ef4444', rating: 1512.345, rd: 290.1, vol: 0.06, initialRating: 1500, createdAt: 1000 },
    { id: 'p2', name: '阿華', color: '#3b82f6', rating: 1488, rd: 300, vol: 0.06, initialRating: 1300, createdAt: 1001 },
  ],
  sessions: [
    { id: 's1', name: '2026/8/5 場次', startedAt: 2000, presentIds: ['p1', 'p2'], leftIds: [], volunteerRest: ['p2'], active: true, defaultScoringFormat: catalog },
    { id: 's2', name: '自訂', startedAt: 2001, presentIds: ['p1'], leftIds: ['p2'], volunteerRest: [], active: false, defaultScoringFormat: custom },
    { id: 's3', name: '未知', startedAt: 2002, presentIds: [], leftIds: [], volunteerRest: [], active: false, defaultScoringFormat: unknown },
  ],
  matches: [
    { id: 'm1', sessionId: 's1', at: 3000, mode: 'doubles', teamA: ['p1'], teamB: ['p2'], scoreA: 21, scoreB: 15, resters: ['p1'], scoringFormat: catalog },
    { id: 'm2', sessionId: 's2', at: 3001, mode: 'singles', teamA: ['p1'], teamB: ['p2'], scoreA: 11, scoreB: 9, resters: [], scoringFormat: custom },
    { id: 'm3', sessionId: 's3', at: 3002, mode: 'doubles', teamA: ['p1'], teamB: ['p2'], scoreA: 999, scoreB: 1, resters: [], scoringFormat: unknown },
  ],
  overrides: [{ id: 'o1', playerId: 'p1', rating: 1800, at: 2500 }],
  baselines: [{ id: 'b1', playerId: 'p2', rating: 1495.5, rd: 200.25, vol: 0.059, at: 3500 }],
}

function replaceFirst(text: string, from: string, to: string): string {
  const index = text.indexOf(from)
  if (index < 0) throw new Error(`missing fixture fragment: ${from}`)
  return text.slice(0, index) + to + text.slice(index + from.length)
}

function legacyProjection(csv: string): string {
  return csv.split('\n').map((line) => {
    if (line.startsWith('id,name,startedAt,')) return line.replace(',defaultScoringFormat', '')
    if (line.startsWith('id,sessionId,at,')) return line.replace(',scoringFormat', '')
    if (line.startsWith('s')) return line.replace(/,(?:"(?:[^"]|"")*"|\{.*\})$/, '')
    if (line.startsWith('m')) return line.replace(/,(?:"(?:[^"]|"")*"|\{.*\})$/, '')
    return line
  }).join('\n')
}

describe('CSV scoring-format snapshots', () => {
  it('round-trips canonical catalog, quoted custom, and unknown JSON cells with every non-format field exact', () => {
    const csv = exportCsv(sample)
    expect(csv).toContain('defaultScoringFormat')
    expect(csv).toContain('scoringFormat')
    expect(csv).toContain(encodeScoringFormat(catalog).replace(/"/g, '""'))
    const back = importCsv(csv)
    expect(back).toEqual(sample)
    expect(importCsv(`\uFEFF${csv}`)).toEqual(sample)
  })

  it('treats only absent format columns as legacy unknown and supports legacy projection then re-upgrade', () => {
    const oldCsv = legacyProjection(exportCsv(sample))
    const back = importCsv(oldCsv)
    expect(back.sessions.map((s) => s.defaultScoringFormat)).toEqual([
      createUnknownSnapshot('legacy-missing'), createUnknownSnapshot('legacy-missing'), createUnknownSnapshot('legacy-missing'),
    ])
    expect(back.matches.map((m) => m.scoringFormat)).toEqual([
      createUnknownSnapshot('legacy-missing'), createUnknownSnapshot('legacy-missing'), createUnknownSnapshot('legacy-missing'),
    ])
    expect(importCsv(exportCsv(back))).toEqual(back)
  })

  it('rejects known structure ambiguity before replacing a candidate', () => {
    const csv = exportCsv(sample)
    expect(() => importCsv(replaceFirst(csv, '[sessions]', '[sessions]\n[sessions]'))).toThrow()
    expect(() => importCsv(replaceFirst(csv, 'defaultScoringFormat', 'defaultScoringFormat,defaultScoringFormat'))).toThrow()
    expect(() => importCsv(replaceFirst(csv, 'id,name,color,rating,rd,vol,initialRating,createdAt', 'id,name,color,rating,rd,vol,initialRating'))).toThrow()
    expect(() => importCsv(replaceFirst(csv, 'p1,"小明, ""特別""",#ef4444,1512.345,290.1,0.06,1500,1000', 'p1,"小明, ""特別""",#ef4444,1512.345,290.1,0.06,1500,1000,surplus'))).toThrow()
  })

  it('ignores unknown sections but enforces text, record, and decoded-field budgets before parsing later content', () => {
    expect(importCsv(`${exportCsv(sample)}[future]\nanything\n`)).toEqual(sample)
    expect(() => importCsv('x'.repeat(5 * 1024 * 1024 + 1))).toThrow()
    expect(() => importCsv(`[players]\nid,name,color,rating,rd,vol,initialRating,createdAt\n${'p,x,#000,1,1,1,1,1\n'.repeat(50001)}`)).toThrow()
    expect(() => importCsv(`[players]\nid,name,color,rating,rd,vol,initialRating,createdAt\np,${'x'.repeat(64 * 1024 + 1)},#000,1,1,1,1,1\n`)).toThrow()
  })

  it('atomically rejects every explicit malformed snapshot or known illegal endpoint', () => {
    const csv = exportCsv(sample)
    const invalidSnapshots = [
      '',
      '{"schemaVersion":1}',
      '{"schemaVersion":1,"kind":"unknown","reason":"explicit-unknown","extra":true}',
      '{"schemaVersion":1,"kind":"catalog","formatId":"badminton-21-w2-c30","formatVersion":1,"rules":{"target":21,"winBy":2,"cap":30},"reason":"explicit-unknown"}',
      '{"schemaVersion":1,"kind":"custom","label":"x","rules":{"target":9007199254740992,"winBy":2,"cap":30}}',
      '{"schemaVersion":1,"kind":"catalog","formatId":"badminton-21-w2-c30","formatVersion":1,"rules":{"target":21,"winBy":2,"cap":29}}',
      '{"schemaVersion":2,"kind":"unknown","reason":"explicit-unknown"}',
    ]
    for (const snapshot of invalidSnapshots) {
      const encoded = snapshot.replace(/"/g, '""')
      expect(() => importCsv(replaceFirst(csv, encodeScoringFormat(catalog).replace(/"/g, '""'), encoded))).toThrow()
    }
    expect(() => importCsv(replaceFirst(csv, 'm1,s1,3000,doubles,p1,p2,21,15,p1,', 'm1,s1,3000,doubles,p1,p2,20,19,p1,'))).toThrow()
  })
})

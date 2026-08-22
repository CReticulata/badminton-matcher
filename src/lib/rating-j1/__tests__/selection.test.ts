import { describe, expect, it } from 'vitest'
import fixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-selector-surface.json?raw'
import { J1_CT_96_GRID, aggregateActivityEqualNll, aggregateActivityMeans, aggregateJ1ValidationNll, selectJ1CT96, selectSmallestWithinTolerance, type J1SelectorEvent } from '../selection'

type Fixture = { input: { roster: number[]; prefix: J1SelectorEvent[] }; expected: { selectedSigmaHex: string; surface: { sigmaHex: string; validationNllHex: string }[] } }
const fixture = JSON.parse(fixtureText) as Fixture
function fromHex(hex: string): number { const bytes = new Uint8Array(8); for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16); return new DataView(bytes.buffer).getFloat64(0, false) }

describe('J1-CT-96 selector', () => {
  it('replays the hand-authored 1728-event fixture and matches its activity-equal surface', () => {
    const result = selectJ1CT96(fixture.input.roster, fixture.input.prefix)
    expect(result.method).toBe('J1-CT-96')
    expect(result.sigmaGrid).toEqual(J1_CT_96_GRID)
    expect(result.selectedSigma).toBe(fromHex(fixture.expected.selectedSigmaHex))
    result.surface.forEach((row, index) => expect(Math.abs(row.validationNll - fromHex(fixture.expected.surface[index].validationNllHex))).toBeLessThanOrEqual(1e-12))
  }, 30000)

  it('fails closed on a missing game, duplicate id, bad chronology, endpoint, roster, or custom grid/window', () => {
    const events = fixture.input.prefix
    expect(() => selectJ1CT96(fixture.input.roster, events.slice(1))).toThrow(/exact complete/)
    expect(() => selectJ1CT96(fixture.input.roster, events.map((event, index) => index === 1 ? { ...event, eventId: events[0].eventId } : event))).toThrow(/exact complete/)
    expect(() => selectJ1CT96(fixture.input.roster, events.map((event, index) => index === 12 ? { ...event, completedAtMinute: 0 } : event))).toThrow(/chronological/)
    expect(() => selectJ1CT96(fixture.input.roster, events.map((event, index) => index === 0 ? { ...event, scoreA: 21, scoreB: 18 } : event))).toThrow(/endpoint/)
    expect(() => selectJ1CT96([0, 1, 2], events)).toThrow(/roster/)
    expect(() => selectJ1CT96(fixture.input.roster, events, { sigmaGrid: [0, 0.1] })).toThrow(/frozen/)
    expect(() => selectJ1CT96(fixture.input.roster, events, { validationWindow: [95, 144] })).toThrow(/frozen/)
  })

  it('exposes activity-equal aggregation and smallest-within-tolerance tie behavior', () => {
    const cells = [
      { sigma: 0, losses: Array.from({ length: 48 }, (_, activity) => Array.from({ length: 12 }, () => activity === 0 ? 3 : 1)) },
      { sigma: 0.02, losses: Array.from({ length: 48 }, () => Array.from({ length: 12 }, () => 1 + 0.5 / 48)) },
    ]
    expect(aggregateActivityEqualNll(cells[0].losses)).toBeCloseTo(1 + 2 / 48, 15)
    expect(selectSmallestWithinTolerance([{ sigma: 0, validationNll: 1 + 0.5e-12 }, { sigma: 0.02, validationNll: 1 }])).toBe(0)
    expect(selectSmallestWithinTolerance([{ sigma: 0, validationNll: 1 + 1e-12 }, { sigma: 0.02, validationNll: 1 }])).toBe(0)
    expect(selectSmallestWithinTolerance([{ sigma: 0, validationNll: 1 + 2e-12 }, { sigma: 0.02, validationNll: 1 }])).toBe(0.02)
    expect(() => aggregateActivityEqualNll(Array.from({ length: 48 }, () => Array.from({ length: 12 }, () => Number.NaN)))).toThrow()
  })

  it('uses compensated activity-equal sums and differs from raw-game weighting', () => {
    expect(aggregateActivityMeans([[0, 0], [9]])).toBe(4.5)
    expect(aggregateActivityMeans([[0, 0], [9]])).not.toBe((0 + 0 + 9) / 3)
    const cancellationSensitive = Array.from({ length: 48 }, () => Array.from({ length: 12 }, () => 0))
    cancellationSensitive[0] = [1e16, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    const naive = cancellationSensitive.reduce((total, activity) => total + activity.reduce((sum, loss) => sum + loss, 0) / activity.length, 0) / cancellationSensitive.length
    expect(aggregateActivityEqualNll(cancellationSensitive)).toBeGreaterThan(naive)
  })

  it('excludes activities 0..95 from loss while requiring the complete prefix surface', () => {
    const candidate0 = Array.from({ length: 144 }, (_, activity) => Array.from({ length: 12 }, () => activity < 96 ? 10 : 1))
    const candidate1 = Array.from({ length: 144 }, (_, activity) => Array.from({ length: 12 }, () => activity < 96 ? 0 : 2))
    const selected = selectSmallestWithinTolerance([
      { sigma: 0, validationNll: aggregateJ1ValidationNll(candidate0) },
      { sigma: 0.02, validationNll: aggregateJ1ValidationNll(candidate1) },
    ])
    expect(selected).toBe(0)
    expect(aggregateActivityMeans(candidate0)).toBeGreaterThan(aggregateActivityMeans(candidate1))
    expect(() => aggregateJ1ValidationNll(candidate0.slice(1))).toThrow(/complete prefix/)
  })
})

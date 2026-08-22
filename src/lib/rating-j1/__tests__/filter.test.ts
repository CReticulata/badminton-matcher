import { describe, expect, it } from 'vitest'
import fixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-activity-transition-close.json?raw'
import endpointFixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-endpoint-mirrors-and-edges.json?raw'
import { J1Filter, type J1PregameView } from '../filter'

type FixtureEvent = J1PregameView & { readonly scoreA: number; readonly scoreB: number }
const fixture = JSON.parse(fixtureText) as { input: { events: FixtureEvent[] }; expected: { jointDimensionAfterFirst: number; activity0Close: { roster: number[]; meanHex: string[]; covarianceHex: string[][]; clocks: number[] }; activity1Close: { meanHex: string[]; covarianceHex: string[][]; clocks: number[] } } }
const FIXTURE_SIGMA = 0.035
const endpointFixture = JSON.parse(endpointFixtureText) as { expected: { oneStepDeltaWeeksHex: string[]; oneStepPregameCovarianceHex: string[][]; oneStepPostCovarianceHex: string[][] } }

function fromHex(hex: string): number {
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return new DataView(bytes.buffer).getFloat64(0, false)
}

function expectNumbers(actual: Float64Array, expected: readonly string[]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - fromHex(expected[index]))).toBeLessThanOrEqual(1e-12))
}

describe('J1Filter fixture activity lifecycle', () => {
  it('rejects outcome-bearing objects at the score-free prepare boundary', () => {
    const filter = new J1Filter([0, 1, 2, 3], { sigma: FIXTURE_SIGMA })
    const scoreBearing = fixture.input.events[0]
    expect(() => filter.prepare(scoreBearing)).toThrow(/score-free/)
    expect(filter.snapshot().version).toBe(0)
  })

  it('matches one-step pregame/posterior and detached activity closes', () => {
    const filter = new J1Filter(fixture.expected.activity0Close.roster, { sigma: FIXTURE_SIGMA })
    const { scoreA: firstScoreA, scoreB: firstScoreB, ...first } = fixture.input.events[0]
    const preparation = filter.prepare(first)
    expect(preparation.prediction.latentMean).toBe(0)
    expect(preparation.prediction.latentVariance).toBeCloseTo(0.8125, 15)
    expect(filter.activeActivityId).toBeNull()
    filter.commit(first, preparation, firstScoreA!, firstScoreB!)
    expect(filter.currentJointDimension).toBe(fixture.expected.jointDimensionAfterFirst)
    const detached0 = filter.detachedClose(0)
    expectNumbers(detached0.mean, fixture.expected.activity0Close.meanHex)
    expectNumbers(detached0.covariance, fixture.expected.activity0Close.covarianceHex.flat())
    expect(detached0.clocks).toEqual(fixture.expected.activity0Close.clocks)
    expect(filter.activeActivityId).toBe(0)
    const { scoreA: secondScoreA, scoreB: secondScoreB, ...second } = fixture.input.events[1]
    const secondPreparation = filter.prepare(second)
    expect(secondPreparation.deltaWeeks).toEqual([100 / 10080, 100 / 10080, 100 / 10080, 100 / 10080])
    expect(filter.activeActivityId).toBe(0)
    filter.commit(second, secondPreparation, secondScoreA!, secondScoreB!)
    const detached1 = filter.detachedClose(1)
    expectNumbers(detached1.mean, fixture.expected.activity1Close.meanHex)
    expectNumbers(detached1.covariance, fixture.expected.activity1Close.covarianceHex.flat())
    expect(detached1.clocks).toEqual(fixture.expected.activity1Close.clocks)
  })

  it('matches the dedicated one-step covariance oracle fixture', () => {
    const filter = new J1Filter([0, 1, 2, 3], { sigma: FIXTURE_SIGMA })
    const view: J1PregameView = {
      eventId: 'edge-update', activityId: 0, gameIndex: 0, completedAtMinute: 100,
      activityAttendees: [0, 1, 2, 3], teamA: [0, 1], teamB: [2, 3],
      targetPoints: 15, winBy: 2, capPoints: 21,
    }
    const preparation = filter.prepare(view)
    expect(preparation.deltaWeeks).toEqual(endpointFixture.expected.oneStepDeltaWeeksHex.map(fromHex))
    expectNumbers(filter.snapshot().state.covariance, endpointFixture.expected.oneStepPregameCovarianceHex.flat())
    filter.commit(view, preparation, 21, 20)
    expectNumbers(filter.detachedClose(0).covariance, endpointFixture.expected.oneStepPostCovarianceHex.flat())
  })

  it('rejects participant time regression without publishing calendar variance', () => {
    const filter = new J1Filter([0, 1, 2, 3], { sigma: 0.055 })
    const first: J1PregameView = { eventId: 'first', activityId: 0, gameIndex: 0, completedAtMinute: 100, activityAttendees: [0, 1, 2, 3], teamA: [0, 1], teamB: [2, 3], targetPoints: 15, winBy: 2, capPoints: 21 }
    filter.commit(first, filter.prepare(first), 15, 10)
    const before = filter.snapshot()
    const backwards = { ...first, eventId: 'backwards', gameIndex: 1, completedAtMinute: 99 }
    expect(() => filter.prepare(backwards)).toThrow(/backwards/)
    expect(filter.snapshot()).toEqual(before)
  })
})

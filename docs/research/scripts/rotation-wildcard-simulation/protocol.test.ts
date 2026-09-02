import { describe, expect, it } from 'vitest'
import {
  CANDIDATE_BANDS,
  METHODS,
  buildRepresentativeProtocol,
  expectedCellIds,
  validateProtocol,
  type SimulationProtocol,
} from './protocol'

describe('rotation wildcard simulation protocol', () => {
  it('freezes the complete representative contract with equal cell seeds', () => {
    const protocol = buildRepresentativeProtocol()

    expect(protocol.schemaVersion).toBe(2)
    expect(protocol.matrixDesign).toBe('deterministic-covering-v1')
    expect(protocol.runKind).toBe('representative')
    expect(protocol.candidateBands).toEqual([
      0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8,
    ])
    expect(protocol.methods).toEqual(['A', 'B', 'C', 'D'])
    expect(protocol.roundsPerScenario).toBe(24)
    expect(protocol.seeds).toHaveLength(500)
    expect(new Set(protocol.seeds).size).toBe(500)
    expect(protocol.cells.map((cell) => cell.id)).toEqual(expectedCellIds())
    expect(protocol.cells).toHaveLength(29)
    expect(new Set(protocol.cells.map((cell) => cell.attendanceFamily))).toEqual(
      new Set(['fixed', 'late-join', 'leave-rejoin', 'voluntary-rest']),
    )
    expect(new Set(protocol.cells.map((cell) => cell.durationFamily))).toEqual(
      new Set(['fixed', 'variable']),
    )
    expect(new Set(protocol.cells.map((cell) => cell.ratingProfile))).toEqual(
      new Set(['equal', 'continuous', 'extreme']),
    )
    expect(Object.isFrozen(protocol)).toBe(true)
    expect(Object.isFrozen(protocol.cells)).toBe(true)
    expect(validateProtocol(protocol)).toEqual(protocol)
  })

  it('rejects representative protocols with fewer than 500 seeds', () => {
    const protocol = mutableProtocol()
    protocol.seeds = protocol.seeds.slice(0, 499)

    expect(() => validateProtocol(protocol)).toThrow(/at least 500 seeds/i)
  })

  it.each([
    {
      label: 'missing method',
      mutate: (protocol: SimulationProtocol) => {
        protocol.methods = ['A', 'B', 'C'] as typeof METHODS
      },
    },
    {
      label: 'duplicate method',
      mutate: (protocol: SimulationProtocol) => {
        protocol.methods = ['A', 'B', 'C', 'C'] as typeof METHODS
      },
    },
    {
      label: 'surplus method',
      mutate: (protocol: SimulationProtocol) => {
        protocol.methods = ['A', 'B', 'C', 'D', 'E'] as typeof METHODS
      },
    },
  ])('rejects $label identities', ({ mutate }) => {
    const protocol = mutableProtocol()
    mutate(protocol)

    expect(() => validateProtocol(protocol)).toThrow(/exactly A, B, C, D/i)
  })

  it.each([
    {
      label: 'missing cell',
      mutate: (protocol: SimulationProtocol) => protocol.cells.pop(),
    },
    {
      label: 'duplicate cell',
      mutate: (protocol: SimulationProtocol) => {
        protocol.cells.push({ ...protocol.cells[0]! })
      },
    },
    {
      label: 'surplus non-counterpart cell',
      mutate: (protocol: SimulationProtocol) => {
        protocol.cells.push({
          ...protocol.cells[0]!,
          id: 'doubles:17:fixed:fixed:equal',
          participantCount: 17,
        })
      },
    },
  ])('rejects a $label', ({ mutate }) => {
    const protocol = mutableProtocol()
    mutate(protocol)

    expect(() => validateProtocol(protocol)).toThrow(/complete cell matrix/i)
  })

  it('rejects candidate-band or metric-contract drift', () => {
    const bandDrift = mutableProtocol()
    bandDrift.candidateBands = [...CANDIDATE_BANDS, 10]
    expect(() => validateProtocol(bandDrift)).toThrow(/candidate bands/i)

    const metricDrift = mutableProtocol()
    metricDrift.metrics.effect.minimumRelativeReduction = 0.2
    expect(() => validateProtocol(metricDrift)).toThrow(/metric contract/i)
  })
})

function mutableProtocol(): SimulationProtocol {
  return structuredClone(buildRepresentativeProtocol()) as SimulationProtocol
}

import { describe, expect, it } from 'vitest'
import { DenseJ1State } from '../state'

describe('DenseJ1State', () => {
  it('opens an independent x/u joint state and closes to the x marginal', () => {
    const state = new DenseJ1State([0, 1, 2, 3])
    expect(Object.keys(state)).not.toContain('index')
    const before = state.snapshot()
    state.open(0)
    const joint = state.jointSnapshot()
    expect(joint.mean).toHaveLength(8)
    expect(joint.covariance).toHaveLength(64)
    expect(joint.covariance[4 * 8 + 4]).toBe(0.09)
    expect(joint.covariance[0 * 8 + 4]).toBe(0)
    joint.mean[0] = 99
    expect(state.jointSnapshot().mean[0]).toBe(0)
    state.close(0)
    expect(state.snapshot()).toEqual(before)
  })

  it('rejects an invalid posterior variance before changing state', () => {
    const state = new DenseJ1State([0, 1, 2, 3])
    state.open(0)
    const before = state.jointSnapshot()
    const latent = state.latent([0, 1, 2, 3])
    expect(() => state.project(latent.h, latent.mean, latent.variance, 0, -1)).toThrow()
    expect(state.jointSnapshot()).toEqual(before)
  })

  it('adds process variance only to participant diagonals', () => {
    const state = new DenseJ1State([0, 1, 2, 3, 4])
    const before = state.snapshot().covariance
    state.addParticipantVariance([0, 1, 2, 3], [0.1, 0.2, 0.3, 0.4])
    const after = state.snapshot().covariance
    expect(after[0]).toBe(before[0] + 0.1)
    expect(after[6]).toBe(before[6] + 0.2)
    expect(after[12]).toBe(before[12] + 0.3)
    expect(after[18]).toBe(before[18] + 0.4)
    expect(after[24]).toBe(before[24])
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 5; column += 1) {
      if (row !== column) expect(after[row * 5 + column]).toBe(before[row * 5 + column])
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  blockInsert,
  copyMatrix,
  matVec,
  outer,
  quadraticForm,
  rankOneUpdate,
  symmetrize,
} from '../numeric'

describe('rating-j1 numeric primitives', () => {
  it('copies bounded finite row-major matrices without aliasing', () => {
    const source = new Float64Array([1, 2, 3, 4])
    const copied = copyMatrix(source, 2, 2)
    source[0] = 99
    expect(copied).toEqual(new Float64Array([1, 2, 3, 4]))
    expect(() => copyMatrix(new Float64Array([1, Number.NaN]), 1, 2)).toThrow(RangeError)
    expect(() => copyMatrix(new Float64Array([1, 2]), 2, 2)).toThrow(RangeError)
  })

  it('performs explicit dense operations with shape and finiteness checks', () => {
    const matrix = new Float64Array([2, 1, 1, 3])
    const vector = new Float64Array([4, 5])
    expect(matVec(matrix, 2, 2, vector)).toEqual(new Float64Array([13, 19]))
    expect(quadraticForm(matrix, 2, vector)).toBe(147)
    expect(outer(new Float64Array([2, 3]), new Float64Array([5, 7]))).toEqual(
      new Float64Array([10, 14, 15, 21]),
    )
    expect(() => matVec(matrix, 2, 2, new Float64Array([1]))).toThrow(RangeError)
    expect(() => quadraticForm(matrix, 2, new Float64Array([Infinity, 1]))).toThrow(RangeError)
  })

  it('updates, inserts, and symmetrizes matrices without mutating inputs', () => {
    const initial = new Float64Array([2, 0, 0, 2])
    expect(rankOneUpdate(initial, 2, new Float64Array([1, 2]), -0.5)).toEqual(
      new Float64Array([1.5, -1, -1, 0]),
    )
    expect(initial).toEqual(new Float64Array([2, 0, 0, 2]))
    expect(blockInsert(new Float64Array([1]), 1, 1, new Float64Array([2, 3, 4, 5]), 2, 2)).toEqual(
      new Float64Array([1, 0, 0, 0, 2, 3, 0, 4, 5]),
    )
    expect(symmetrize(new Float64Array([1, 2, 4, 3]), 2)).toEqual(new Float64Array([1, 3, 3, 3]))
  })
})

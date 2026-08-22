import { MAX_DENSE_DIMENSION } from './types'

function assertDimension(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DENSE_DIMENSION) {
    throw new RangeError(`invalid dense dimension: ${value}`)
  }
}

function assertFiniteValues(values: Float64Array): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) throw new RangeError('matrix/vector contains non-finite value')
  }
}

function checkedSize(rows: number, columns: number): number {
  assertDimension(rows)
  assertDimension(columns)
  const size = rows * columns
  if (!Number.isSafeInteger(size) || size > MAX_DENSE_DIMENSION * MAX_DENSE_DIMENSION) {
    throw new RangeError('dense matrix dimensions overflow')
  }
  return size
}

function assertMatrix(values: Float64Array, rows: number, columns: number): void {
  if (values.length !== checkedSize(rows, columns)) throw new RangeError('matrix shape mismatch')
  assertFiniteValues(values)
}

function assertVector(values: Float64Array, length: number): void {
  assertDimension(length)
  if (values.length !== length) throw new RangeError('vector shape mismatch')
  assertFiniteValues(values)
}

export function copyMatrix(values: Float64Array, rows: number, columns: number): Float64Array {
  assertMatrix(values, rows, columns)
  return new Float64Array(values)
}

export function matVec(
  matrix: Float64Array,
  rows: number,
  columns: number,
  vector: Float64Array,
): Float64Array {
  assertMatrix(matrix, rows, columns)
  assertVector(vector, columns)
  const result = new Float64Array(rows)
  for (let row = 0; row < rows; row += 1) {
    let sum = 0
    const offset = row * columns
    for (let column = 0; column < columns; column += 1) sum += matrix[offset + column] * vector[column]
    result[row] = sum
  }
  return result
}

export function quadraticForm(matrix: Float64Array, dimension: number, vector: Float64Array): number {
  assertMatrix(matrix, dimension, dimension)
  assertVector(vector, dimension)
  const product = matVec(matrix, dimension, dimension, vector)
  let sum = 0
  for (let index = 0; index < dimension; index += 1) sum += vector[index] * product[index]
  if (!Number.isFinite(sum)) throw new RangeError('quadratic form is non-finite')
  return sum
}

export function outer(left: Float64Array, right: Float64Array): Float64Array {
  assertDimension(left.length)
  assertDimension(right.length)
  assertFiniteValues(left)
  assertFiniteValues(right)
  const result = new Float64Array(checkedSize(left.length, right.length))
  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < right.length; column += 1) result[row * right.length + column] = left[row] * right[column]
  }
  return result
}

export function rankOneUpdate(
  matrix: Float64Array,
  dimension: number,
  vector: Float64Array,
  scale: number,
): Float64Array {
  assertMatrix(matrix, dimension, dimension)
  assertVector(vector, dimension)
  if (!Number.isFinite(scale)) throw new RangeError('rank-one scale is non-finite')
  const result = new Float64Array(matrix)
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      const value = result[row * dimension + column] + scale * vector[row] * vector[column]
      if (!Number.isFinite(value)) throw new RangeError('rank-one update is non-finite')
      result[row * dimension + column] = value
    }
  }
  return result
}

export function blockInsert(
  base: Float64Array,
  baseRows: number,
  baseColumns: number,
  block: Float64Array,
  blockRows: number,
  blockColumns: number,
): Float64Array {
  assertMatrix(base, baseRows, baseColumns)
  assertMatrix(block, blockRows, blockColumns)
  const rows = baseRows + blockRows
  const columns = baseColumns + blockColumns
  const result = new Float64Array(checkedSize(rows, columns))
  for (let row = 0; row < baseRows; row += 1) {
    for (let column = 0; column < baseColumns; column += 1) result[row * columns + column] = base[row * baseColumns + column]
  }
  for (let row = 0; row < blockRows; row += 1) {
    for (let column = 0; column < blockColumns; column += 1) {
      result[(baseRows + row) * columns + baseColumns + column] = block[row * blockColumns + column]
    }
  }
  return result
}

export function symmetrize(matrix: Float64Array, dimension: number): Float64Array {
  assertMatrix(matrix, dimension, dimension)
  const result = new Float64Array(matrix)
  for (let row = 0; row < dimension; row += 1) {
    for (let column = row + 1; column < dimension; column += 1) {
      const average = (matrix[row * dimension + column] + matrix[column * dimension + row]) / 2
      if (!Number.isFinite(average)) throw new RangeError('symmetrized value is non-finite')
      result[row * dimension + column] = average
      result[column * dimension + row] = average
    }
  }
  return result
}

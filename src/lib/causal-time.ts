export function assertSafeCausalTimestamp(value: unknown, field: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value >= Number.MAX_SAFE_INTEGER
  ) throw new Error(`${field} timestamp is outside the safe causal domain`)
  return value
}

export function nextSafeCausalTimestamp(value: unknown, field: string): number {
  const next = assertSafeCausalTimestamp(value, field) + 1
  return assertSafeCausalTimestamp(next, `${field} successor`)
}

export function assertIncrementableCausalTimestamp(value: unknown, field: string): number {
  const current = assertSafeCausalTimestamp(value, field)
  nextSafeCausalTimestamp(current, field)
  return current
}

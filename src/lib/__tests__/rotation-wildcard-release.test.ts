import { describe, expect, it } from 'vitest'
import {
  ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD,
  ROTATION_WILDCARD_GENERATION_RELEASED,
  rotationWildcardGenerationEnabled,
} from '../rotation-wildcard-release'

describe('rotation wildcard production release flag', () => {
  it('enables generation in production under the exact 0.5 risk acceptance', () => {
    expect(ROTATION_WILDCARD_GENERATION_RELEASED).toBe(true)
    expect(rotationWildcardGenerationEnabled('production')).toBe(true)
  })

  it('keeps test and development paths available for acceptance before release', () => {
    expect(ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD).toBe(true)
    expect(rotationWildcardGenerationEnabled('test')).toBe(true)
    expect(rotationWildcardGenerationEnabled('development')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD,
  ROTATION_WILDCARD_GENERATION_RELEASED,
  rotationWildcardGenerationEnabled,
} from '../rotation-wildcard-release'

describe('rotation wildcard production release flag', () => {
  it('keeps generation disabled in production without an approved manifest', () => {
    expect(ROTATION_WILDCARD_GENERATION_RELEASED).toBe(false)
    expect(rotationWildcardGenerationEnabled('production')).toBe(false)
  })

  it('keeps test and development paths available for acceptance before release', () => {
    expect(ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD).toBe(true)
    expect(rotationWildcardGenerationEnabled('test')).toBe(true)
    expect(rotationWildcardGenerationEnabled('development')).toBe(true)
  })
})

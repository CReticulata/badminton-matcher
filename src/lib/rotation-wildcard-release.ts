import { ROTATION_WILDCARD_GENERATION_RELEASED } from './rotation-wildcard-release-authority'

export { ROTATION_WILDCARD_GENERATION_RELEASED }

export const ROTATION_WILDCARD_GENERATION_ENABLED_FOR_THIS_BUILD =
  import.meta.env.MODE !== 'production' || ROTATION_WILDCARD_GENERATION_RELEASED

export function rotationWildcardGenerationEnabled(mode = import.meta.env.MODE): boolean {
  return mode !== 'production' || ROTATION_WILDCARD_GENERATION_RELEASED
}

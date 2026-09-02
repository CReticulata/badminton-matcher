import type { RotationWildcardLineageV1, RoundProposal } from '../types'

export function validatedRotationWildcardLineage(
  proposal: Pick<RoundProposal, 'mode' | 'teamA' | 'teamB' | 'rotationWildcard'>,
): RotationWildcardLineageV1 | undefined {
  const lineage = proposal.rotationWildcard
  if (!lineage) return undefined
  const need = proposal.mode === 'doubles' ? 4 : 2
  const normal = lineage.normalPlayingIds
  const final = [...proposal.teamA, ...proposal.teamB]
  const normalSet = new Set(normal)
  const finalSet = new Set(final)
  if (
    lineage.schemaVersion !== 1 ||
    normal.length !== need ||
    normalSet.size !== need ||
    final.length !== need ||
    finalSet.size !== need ||
    normal.some((id) => typeof id !== 'string' || !id) ||
    typeof lineage.exchangedOutId !== 'string' || !lineage.exchangedOutId ||
    typeof lineage.exchangedInId !== 'string' || !lineage.exchangedInId ||
    !normalSet.has(lineage.exchangedOutId) ||
    normalSet.has(lineage.exchangedInId) ||
    finalSet.has(lineage.exchangedOutId) ||
    !finalSet.has(lineage.exchangedInId)
  ) return undefined

  const expected = new Set(normal)
  expected.delete(lineage.exchangedOutId)
  expected.add(lineage.exchangedInId)
  if (expected.size !== finalSet.size || [...expected].some((id) => !finalSet.has(id))) {
    return undefined
  }
  return lineage
}

export function cloneValidatedRotationWildcardLineage(
  proposal: Pick<RoundProposal, 'mode' | 'teamA' | 'teamB' | 'rotationWildcard'>,
): RotationWildcardLineageV1 | undefined {
  const lineage = validatedRotationWildcardLineage(proposal)
  return lineage
    ? {
        schemaVersion: 1,
        normalPlayingIds: [...lineage.normalPlayingIds],
        exchangedOutId: lineage.exchangedOutId,
        exchangedInId: lineage.exchangedInId,
      }
    : undefined
}

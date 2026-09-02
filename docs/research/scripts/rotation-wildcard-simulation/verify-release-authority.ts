import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FAIRNESS_BAND } from '../../../../src/lib/matchmaking'
import { ROTATION_WILDCARD_GENERATION_RELEASED } from '../../../../src/lib/rotation-wildcard-release-authority'
import {
  assertCanonicalCandidateCellSets,
  assertProductionBundleHasNoWildcardGenerator,
  assertRotationWildcardReleaseAuthority,
  canonicalizeSliceRegressions,
  type RotationWildcardApprovalManifestV1,
  type SliceRegressionCell,
} from './release-authority'
import { expectedCellIds } from './protocol'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const ARTIFACT_ROOT = join(ROOT, 'docs/research/artifacts/rotation-wildcard/representative-v2')
const REPORT_PATH = join(ARTIFACT_ROOT, 'report.md')
const SUMMARY_PATH = join(ARTIFACT_ROOT, 'summary.json')
const APPROVAL_PATH = join(ROOT, 'docs/research/rotation-wildcard-band-approval.json')
const DIST_PATH = join(ROOT, 'dist')

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

function filesUnder(path: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(path)) {
    const child = join(path, name)
    if (statSync(child).isDirectory()) out.push(...filesUnder(child))
    else out.push(child)
  }
  return out
}

interface RepresentativeSummary {
  candidates: Array<{
    candidateBand: number
    passesEffectGate: boolean
    passesEveryCellFairnessGate: boolean
    cells: Record<string, SliceRegressionCell>
  }>
}

export function verifyCurrentReleaseAuthority(): void {
  const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RepresentativeSummary
  const approvalManifest = existsSync(APPROVAL_PATH)
    ? JSON.parse(readFileSync(APPROVAL_PATH, 'utf8')) as RotationWildcardApprovalManifestV1
    : null

  assertCanonicalCandidateCellSets(summary.candidates, expectedCellIds())

  assertRotationWildcardReleaseAuthority({
    productionFairnessBand: DEFAULT_FAIRNESS_BAND,
    productionWildcardReleased: ROTATION_WILDCARD_GENERATION_RELEASED,
    approvalManifest,
    reportSha256: sha256(REPORT_PATH),
    summarySha256: sha256(SUMMARY_PATH),
    candidates: summary.candidates.map((candidate) => ({
      candidateBand: candidate.candidateBand,
      passesEffectGate: candidate.passesEffectGate,
      passesEveryCellFairnessGate: candidate.passesEveryCellFairnessGate,
      requiredDisclosedRegressions: canonicalizeSliceRegressions(candidate.cells),
    })),
  })

  if (!existsSync(DIST_PATH)) throw new Error('dist is missing; build before release verification')
  if (!ROTATION_WILDCARD_GENERATION_RELEASED) {
    const buildTexts = filesUnder(DIST_PATH)
      .filter((path) => /\.(?:js|html|css|json)$/.test(path))
      .map((path) => readFileSync(path, 'utf8'))
    assertProductionBundleHasNoWildcardGenerator(buildTexts)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyCurrentReleaseAuthority()
  console.log(
    `Release authority verified: band=${DEFAULT_FAIRNESS_BAND}, wildcardReleased=${ROTATION_WILDCARD_GENERATION_RELEASED}, approval=${existsSync(APPROVAL_PATH) ? 'present' : 'absent'}`,
  )
}

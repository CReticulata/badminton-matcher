import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import { DEFAULT_FAIRNESS_BAND } from '../../../../src/lib/matchmaking'
import { ROTATION_WILDCARD_GENERATION_RELEASED } from '../../../../src/lib/rotation-wildcard-release-authority'
import {
  assertCanonicalCandidateCellSets,
  assertDeniedBehaviorContract,
  assertProductionBundleWildcardRelease,
  assertRotationWildcardReleaseAuthority,
  canonicalizeSliceRegressions,
  type RotationWildcardApprovalManifestV1,
  type DeniedBehaviorContractV1,
  type RotationWildcardRiskAcceptanceManifestV2,
} from './release-authority'
import { expectedCellIds } from './protocol'
import type { RepresentativeSummary } from './representative'
import { PRODUCTION_WILDCARD_PROBE_CASES } from './production-wildcard-probe-fixtures'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const ARTIFACT_ROOT = join(ROOT, 'docs/research/artifacts/rotation-wildcard/representative-v2')
const REPORT_PATH = join(ARTIFACT_ROOT, 'report.md')
const SUMMARY_PATH = join(ARTIFACT_ROOT, 'summary.json')
const APPROVAL_PATH = join(ROOT, 'docs/research/rotation-wildcard-band-approval.json')
const RISK_ACCEPTANCE_PATH = join(ROOT, 'docs/decisions/rotation-wildcard-05-risk-acceptance.json')
const DENIED_BEHAVIOR_CONTRACT_PATH = join(ROOT, 'docs/decisions/rotation-wildcard-denied-behavior-contract-v1.json')
const DIST_PATH = join(ROOT, 'dist')

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

interface ViteManifestChunk {
  file?: unknown
  src?: unknown
  isEntry?: unknown
  imports?: unknown
  dynamicImports?: unknown
}

function safeBuiltPath(path: unknown, field: string): string {
  if (
    typeof path !== 'string'
    || !path
    || posix.isAbsolute(path)
    || path.split('/').includes('..')
  ) throw new Error(`Invalid Vite manifest ${field}`)
  return path
}

export function entrypointReachableJavaScriptChunks(distPath: string): string[] {
  const manifestPath = join(distPath, '.vite/manifest.json')
  const indexPath = join(distPath, 'index.html')
  if (!existsSync(manifestPath) || !existsSync(indexPath)) {
    throw new Error('Built Vite manifest or index.html is missing')
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ViteManifestChunk>
  const entry = manifest['index.html']
  if (!entry || entry.isEntry !== true || entry.src !== 'index.html') {
    throw new Error('Vite manifest index.html entry is inconsistent')
  }
  const entryFile = safeBuiltPath(entry.file, 'index.html file')
  if (!entryFile.endsWith('.js')) throw new Error('Vite index entry is not JavaScript')

  const html = readFileSync(indexPath, 'utf8')
  const localModuleScripts = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>/gi)]
    .map((match) => match[0].match(/\bsrc=["']([^"']+)["']/i)?.[1])
    .filter((source): source is string => Boolean(source && !/^(?:https?:)?\/\//.test(source)))
    .map((source) => source.replace(/^\.\//, '').replace(/^\//, ''))
  if (localModuleScripts.length !== 1 || localModuleScripts[0] !== entryFile) {
    throw new Error('Built index.html module entry does not match the Vite manifest')
  }

  const reachable = new Set<string>()
  const visit = (key: string) => {
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Vite manifest references missing chunk: ${key}`)
    const file = safeBuiltPath(chunk.file, `${key} file`)
    if (!file.endsWith('.js')) throw new Error(`Reachable Vite chunk is not JavaScript: ${file}`)
    if (!existsSync(join(distPath, file)) || !statSync(join(distPath, file)).isFile()) {
      throw new Error(`Reachable Vite JavaScript chunk is missing: ${file}`)
    }
    if (reachable.has(file)) return
    reachable.add(file)
    for (const field of ['imports', 'dynamicImports'] as const) {
      const references = chunk[field] ?? []
      if (!Array.isArray(references) || references.some((value) => typeof value !== 'string')) {
        throw new Error(`Vite manifest ${key}.${field} is invalid`)
      }
      for (const reference of references) visit(reference)
    }
  }
  visit('index.html')
  return [...reachable].sort()
}

export interface BuiltWildcardProbeObservation {
  playingCount: number
  replacedSeats: number
}

const turn = () => new Promise<void>((resolveTurn) => setTimeout(resolveTurn, 0))

async function probeCase(
  builtJavaScript: string,
  probe: typeof PRODUCTION_WILDCARD_PROBE_CASES[number],
): Promise<BuiltWildcardProbeObservation> {
  const window = new Window({ url: 'https://fixture.invalid/' })
  try {
    window.document.body.innerHTML = '<div id="app"></div>'
    window.localStorage.setItem('badminton-matcher:v1', JSON.stringify(probe.fixture))
    window.Date.now = () => 3_600_100
    window.Math.random = () => 0
    window.fetch = (() => Promise.reject(new Error('network disabled in production probe'))) as typeof window.fetch
    const rejectNetwork = class {
      constructor() { throw new Error('network disabled in production probe') }
    }
    Object.defineProperty(window, 'XMLHttpRequest', { value: rejectNetwork })
    Object.defineProperty(window, 'WebSocket', { value: rejectNetwork })
    Object.defineProperty(window, 'EventSource', { value: rejectNetwork })
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register: () => Promise.reject(new Error('service workers disabled in production probe')) },
    })
    Object.defineProperty(window.navigator, 'sendBeacon', {
      value: () => { throw new Error('network disabled in production probe') },
    })

    window.eval(builtJavaScript)
    await turn()
    await turn()
    const clickButton = async (label: string) => {
      const button = [...window.document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === label)
      if (!button) throw new Error(`Built wildcard probe cannot find button: ${label}`)
      button.click()
      await turn()
      await turn()
    }
    if (probe.mode === 'singles') await clickButton('單打')
    await clickButton('產生下一場分組')
    await clickButton('開始比賽')

    let liveMatch: Record<string, unknown> | undefined
    for (let attempt = 0; attempt < 20 && !liveMatch; attempt++) {
      const saved = JSON.parse(window.localStorage.getItem('badminton-matcher:v1') ?? '{}') as {
        sessions?: { liveMatch?: Record<string, unknown> }[]
      }
      liveMatch = saved.sessions?.[0]?.liveMatch
      if (!liveMatch) await turn()
    }
    const lineage = liveMatch?.rotationWildcard as {
      schemaVersion?: unknown
      normalPlayingIds?: unknown
      exchangedOutId?: unknown
      exchangedInId?: unknown
    } | undefined
    const teamA = liveMatch?.teamA
    const teamB = liveMatch?.teamB
    if (!lineage || lineage.schemaVersion !== 1 || !Array.isArray(lineage.normalPlayingIds)) {
      throw new Error(`Built ${probe.name} wildcard probe did not persist valid lineage`)
    }
    if (!Array.isArray(teamA) || !Array.isArray(teamB)) {
      throw new Error(`Built ${probe.name} wildcard probe did not persist teams`)
    }
    const playing = [...teamA, ...teamB] as string[]
    const normal = lineage.normalPlayingIds as string[]
    const removed = normal.filter((id) => !playing.includes(id))
    const added = playing.filter((id) => !normal.includes(id))
    if (
      playing.length !== (probe.mode === 'doubles' ? 4 : 2)
      || new Set(playing).size !== playing.length
      || removed.length !== 1
      || added.length !== 1
      || removed[0] !== lineage.exchangedOutId
      || added[0] !== lineage.exchangedInId
    ) throw new Error(`Built ${probe.name} wildcard probe did not make exactly one valid replacement`)
    return { playingCount: playing.length, replacedSeats: 1 }
  } finally {
    await window.happyDOM.close()
  }
}

export async function probeBuiltProductionWildcard(distPath: string): Promise<{
  doubles: BuiltWildcardProbeObservation
  singles: BuiltWildcardProbeObservation
}> {
  const chunks = entrypointReachableJavaScriptChunks(distPath)
  if (chunks.length !== 1) {
    throw new Error('Built wildcard behavior probe supports only a self-contained one-chunk Vite entry graph')
  }
  const builtJavaScript = readFileSync(join(distPath, chunks[0]!), 'utf8')
  if (/^\s*import\s/m.test(builtJavaScript) || /\bimport\s*\(/.test(builtJavaScript)) {
    throw new Error('Built wildcard behavior probe does not support JavaScript module imports')
  }
  return {
    doubles: await probeCase(builtJavaScript, PRODUCTION_WILDCARD_PROBE_CASES[0]),
    singles: await probeCase(builtJavaScript, PRODUCTION_WILDCARD_PROBE_CASES[1]),
  }
}

export async function verifyCurrentReleaseAuthority(): Promise<void> {
  const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RepresentativeSummary
  const approvalManifest = existsSync(APPROVAL_PATH)
    ? JSON.parse(readFileSync(APPROVAL_PATH, 'utf8')) as RotationWildcardApprovalManifestV1
    : null
  const riskAcceptanceManifest = existsSync(RISK_ACCEPTANCE_PATH)
    ? JSON.parse(readFileSync(RISK_ACCEPTANCE_PATH, 'utf8')) as RotationWildcardRiskAcceptanceManifestV2
    : null

  const deniedBehaviorContract = JSON.parse(
    readFileSync(DENIED_BEHAVIOR_CONTRACT_PATH, 'utf8'),
  ) as DeniedBehaviorContractV1
  const deniedBehaviorSourceBytes = new Map(
    deniedBehaviorContract.sources.map(({ path }) => [path, readFileSync(join(ROOT, path))]),
  )
  assertDeniedBehaviorContract(deniedBehaviorContract, deniedBehaviorSourceBytes)

  assertCanonicalCandidateCellSets(summary.candidates, expectedCellIds())

  assertRotationWildcardReleaseAuthority({
    productionFairnessBand: DEFAULT_FAIRNESS_BAND,
    productionWildcardReleased: ROTATION_WILDCARD_GENERATION_RELEASED,
    approvalManifest,
    riskAcceptanceManifest,
    deniedBehaviorContractSha256: sha256(DENIED_BEHAVIOR_CONTRACT_PATH),
    reportSha256: sha256(REPORT_PATH),
    summarySha256: sha256(SUMMARY_PATH),
    candidates: summary.candidates.map((candidate) => {
      const cells = Object.values(candidate.cells)
      return {
        candidateBand: candidate.candidateBand,
        passesEffectGate: candidate.passesEffectGate,
        passesEveryCellFairnessGate: candidate.passesEveryCellFairnessGate,
        requiredDisclosedRegressions: canonicalizeSliceRegressions(candidate.cells),
        relativeRepeatReduction: candidate.relativeRepeatReduction,
        failedFairnessCells: cells.filter((cell) => !cell.passesFairnessGate).length,
        totalFairnessCells: cells.length,
        maxAppearanceShortfallP95: Math.max(...cells.map((cell) => cell.appearanceShortfallP95)),
        maxNonVoluntaryRestIncreaseP95: Math.max(...cells.map((cell) => cell.nonVoluntaryRestIncreaseP95)),
      }
    }),
  })

  if (!existsSync(DIST_PATH)) throw new Error('dist is missing; build before release verification')
  const buildTexts = entrypointReachableJavaScriptChunks(DIST_PATH)
    .map((path) => readFileSync(join(DIST_PATH, path), 'utf8'))
  assertProductionBundleWildcardRelease(buildTexts, ROTATION_WILDCARD_GENERATION_RELEASED)
  if (ROTATION_WILDCARD_GENERATION_RELEASED) await probeBuiltProductionWildcard(DIST_PATH)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyCurrentReleaseAuthority()
  console.log(
    `Release authority verified: band=${DEFAULT_FAIRNESS_BAND}, wildcardReleased=${ROTATION_WILDCARD_GENERATION_RELEASED}, approval=${existsSync(APPROVAL_PATH) ? 'present' : 'absent'}, riskAcceptance=${existsSync(RISK_ACCEPTANCE_PATH) ? 'present' : 'absent'}`,
  )
}

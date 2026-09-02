import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { arch, hostname, platform } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  evaluateScenarioBands,
  summarizeCandidateRows,
  type CandidateSummary,
  type EvaluationRow,
} from './evaluator'
import { buildScenarioManifest } from './manifest'
import {
  buildRepresentativeProtocol,
  validateProtocol,
  type SimulationProtocol,
} from './protocol'

const PRODUCTION_FAIRNESS_BAND = 0.5
const SOURCE_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'src/types.ts',
  'src/lib/matchmaking.ts',
  'docs/research/scripts/rotation-wildcard-simulation/protocol.ts',
  'docs/research/scripts/rotation-wildcard-simulation/manifest.ts',
  'docs/research/scripts/rotation-wildcard-simulation/evaluator.ts',
  'docs/research/scripts/rotation-wildcard-simulation/representative.ts',
] as const
const RECEIPTED_FILES = [
  'protocol.json',
  'primary.csv',
  'summary.json',
  'report.md',
] as const

export interface RepresentativeContract {
  candidateBands: readonly number[]
  cellIds: string[]
  seeds: string[]
}

interface DenominatorDiagnostics {
  eligibleOpportunities: number
  noCapacityControls: number
  triggerRepeats: number
  actualRepeats: number
}

export interface RepresentativeCandidateSummary extends CandidateSummary {
  denominators: Record<'A' | 'B' | 'C' | 'D', DenominatorDiagnostics>
}

export interface RepresentativeSummary {
  schemaVersion: 1
  runKind: 'representative'
  promotionEvidenceEligible: true
  productionFairnessBand: 0.5
  productionChangeAuthorized: false
  recommendedCandidateBand: number | null
  candidates: RepresentativeCandidateSummary[]
}

export function buildRepresentativeSummary(
  rows: readonly EvaluationRow[],
  contract: RepresentativeContract,
): RepresentativeSummary {
  const candidates = contract.candidateBands.map((candidateBand) => {
    const candidateRows = rows.filter((row) => row.candidateBand === candidateBand)
    const summary = summarizeCandidateRows(candidateRows, {
      candidateBand,
      cellIds: contract.cellIds,
      seeds: contract.seeds,
    })
    const denominators = Object.fromEntries(
      (['A', 'B', 'C', 'D'] as const).map((method) => {
        const methodRows = candidateRows.filter((row) => row.method === method)
        return [
          method,
          {
            eligibleOpportunities: sum(
              methodRows.map((row) => row.eligibleOpportunities),
            ),
            noCapacityControls: sum(
              methodRows.map((row) => row.noCapacityControls),
            ),
            triggerRepeats: sum(
              methodRows.map((row) => row.triggerRepeatCount),
            ),
            actualRepeats: sum(
              methodRows.map((row) => row.actualRepeatCount),
            ),
          },
        ]
      }),
    ) as RepresentativeCandidateSummary['denominators']
    return { ...summary, denominators }
  })
  const passing = candidates
    .filter(
      (candidate) =>
        candidate.passesEffectGate && candidate.passesEveryCellFairnessGate,
    )
    .sort(
      (left, right) =>
        left.equalCellMean.D - right.equalCellMean.D ||
        left.candidateBand - right.candidateBand,
    )

  return {
    schemaVersion: 1,
    runKind: 'representative',
    promotionEvidenceEligible: true,
    productionFairnessBand: PRODUCTION_FAIRNESS_BAND,
    productionChangeAuthorized: false,
    recommendedCandidateBand: passing[0]?.candidateBand ?? null,
    candidates,
  }
}

export function renderRepresentativeReport(
  summary: RepresentativeSummary,
): string {
  const lines = [
    '# Rotation wildcard representative simulation',
    '',
    `Production fairness band: **${summary.productionFairnessBand} appearances/hour**`,
    'Production change authorized: **no**',
    `Recommended candidate from evidence: **${summary.recommendedCandidateBand ?? 'none'}**`,
    '',
    'The recommendation is evidence only. It cannot modify production without an exact-digest human approval manifest.',
    '',
    '## Candidate gates (authoritative)',
    '',
    '| Candidate | A equal-cell repeat | D equal-cell repeat | Relative reduction | Effect ≥25% | Every-cell fairness |',
    '| ---: | ---: | ---: | ---: | :---: | :---: |',
  ]
  for (const candidate of summary.candidates) {
    lines.push(
      `| ${candidate.candidateBand} | ${fixed(candidate.equalCellMean.A)} | ${fixed(candidate.equalCellMean.D)} | ${percent(candidate.relativeRepeatReduction)} | ${pass(candidate.passesEffectGate)} | ${pass(candidate.passesEveryCellFairnessGate)} |`,
    )
  }

  lines.push('', '## Denominator diagnostics', '')
  for (const candidate of summary.candidates) {
    lines.push(`### Candidate ${candidate.candidateBand}`, '')
    lines.push(
      '| Method | Eligible opportunities | No-capacity controls | Trigger repeats | Actual repeats |',
      '| :---: | ---: | ---: | ---: | ---: |',
    )
    for (const method of ['A', 'B', 'C', 'D'] as const) {
      const value = candidate.denominators[method]
      lines.push(
        `| ${method} | ${value.eligibleOpportunities} | ${value.noCapacityControls} | ${value.triggerRepeats} | ${value.actualRepeats} |`,
      )
    }
    lines.push('')
  }

  lines.push(
    '## Every candidate × cell fairness tails',
    '',
    '| Candidate | Cell | Appearance p95 | Rest p95 | Gate | Appearance p99 | Rest p99 | Appearance max | Rest max |',
    '| ---: | :--- | ---: | ---: | :---: | ---: | ---: | ---: | ---: |',
  )
  for (const candidate of summary.candidates) {
    for (const [cellId, cell] of Object.entries(candidate.cells)) {
      lines.push(
        `| ${candidate.candidateBand} | ${cellId} | ${fixed(cell.appearanceShortfallP95)} | ${fixed(cell.nonVoluntaryRestIncreaseP95)} | ${pass(cell.passesFairnessGate)} | ${fixed(cell.appearanceShortfallP99)} | ${fixed(cell.nonVoluntaryRestIncreaseP99)} | ${fixed(cell.appearanceShortfallMax)} | ${fixed(cell.nonVoluntaryRestIncreaseMax)} |`,
      )
    }
  }

  lines.push('', '## Pooled sensitivity (non-authoritative)', '')
  lines.push(
    '| Candidate | A pooled repeat | D pooled repeat | Relative reduction |',
    '| ---: | ---: | ---: | ---: |',
  )
  for (const candidate of summary.candidates) {
    lines.push(
      `| ${candidate.candidateBand} | ${fixed(candidate.pooledSensitivity.repeatRates.A)} | ${fixed(candidate.pooledSensitivity.repeatRates.D)} | ${percent(candidate.pooledSensitivity.relativeRepeatReduction)} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

export async function runRepresentative(
  outputDirectory: string,
  onProgress: (message: string) => void = console.log,
): Promise<void> {
  if (!basename(outputDirectory).toLowerCase().includes('representative')) {
    throw new Error('Representative evidence requires a representative-labeled output path')
  }
  const startedAt = new Date()
  const start = performance.now()
  const protocol = validateProtocol(
    structuredClone(buildRepresentativeProtocol()) as SimulationProtocol,
  )
  const rows: EvaluationRow[] = []

  for (let cellIndex = 0; cellIndex < protocol.cells.length; cellIndex++) {
    const cell = protocol.cells[cellIndex]!
    for (const seed of protocol.seeds) {
      rows.push(
        ...evaluateScenarioBands({
          manifest: buildScenarioManifest({
            cell,
            seed,
            rounds: protocol.roundsPerScenario,
          }),
          candidateBands: protocol.candidateBands,
        }),
      )
    }
    onProgress(
      `Representative progress ${cellIndex + 1}/${protocol.cells.length}: ${cell.id}`,
    )
  }

  const contract: RepresentativeContract = {
    candidateBands: protocol.candidateBands,
    cellIds: protocol.cells.map((cell) => cell.id),
    seeds: protocol.seeds,
  }
  const summary = buildRepresentativeSummary(rows, contract)
  const report = renderRepresentativeReport(summary)
  const output = resolve(outputDirectory)
  const staging = `${output}.tmp-${process.pid}`
  const backup = `${output}.backup-${process.pid}`
  mkdirSync(dirname(output), { recursive: true })
  rmSync(staging, { recursive: true, force: true })
  rmSync(backup, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  try {
    writeFileSync(join(staging, 'protocol.json'), canonicalJson(protocol))
    await writePrimaryCsv(join(staging, 'primary.csv'), rows)
    writeFileSync(join(staging, 'summary.json'), canonicalJson(summary))
    writeFileSync(join(staging, 'report.md'), report)
    const receipt = {
      schemaVersion: 1,
      runKind: 'representative',
      promotionEvidenceEligible: true,
      productionChangeAuthorized: false,
      artifactsSha256: Object.fromEntries(
        RECEIPTED_FILES.map((file) => [
          file,
          sha256(readFileSync(join(staging, file))),
        ]),
      ),
      source: sourceReceipt(process.cwd()),
      excludedRuntimeMetadata: ['runtime-metadata.json'],
    }
    writeFileSync(join(staging, 'receipt.json'), canonicalJson(receipt))

    if (existsSync(output)) renameSync(output, backup)
    renameSync(staging, output)
    rmSync(backup, { recursive: true, force: true })
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    if (!existsSync(output) && existsSync(backup)) renameSync(backup, output)
    throw error
  }

  const completedAt = new Date()
  writeFileSync(
    join(output, 'runtime-metadata.json'),
    canonicalJson({
      schemaVersion: 1,
      excludedFromReceipt: true,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMilliseconds: Math.round(performance.now() - start),
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      nodeVersion: process.version,
      cellCount: protocol.cells.length,
      seedCount: protocol.seeds.length,
      candidateCount: protocol.candidateBands.length,
      primaryRowCount: rows.length,
      peakResidentSetBytes: process.resourceUsage().maxRSS * 1024,
    }),
  )
  onProgress(`Representative artifacts written: ${output}`)
}

async function writePrimaryCsv(path: string, rows: readonly EvaluationRow[]): Promise<void> {
  const columns: (keyof EvaluationRow)[] = [
    'candidateBand',
    'cellId',
    'seed',
    'method',
    'eligibleOpportunities',
    'noCapacityControls',
    'actualRepeatCount',
    'triggerRepeatCount',
    'maxAppearanceShortfallVsA',
    'maxNonVoluntaryRestIncreaseVsA',
    'fixedRatingsDigest',
  ]
  const stream = createWriteStream(path, { encoding: 'utf8' })
  stream.write(`${columns.join(',')}\n`)
  for (const row of rows) {
    const line = `${columns.map((column) => csvCell(row[column])).join(',')}\n`
    if (!stream.write(line)) await once(stream, 'drain')
  }
  stream.end()
  await once(stream, 'finish')
}

function sourceReceipt(root: string): { files: string[]; sha256: string } {
  const files = SOURCE_FILES.map((file) => relative(root, resolve(root, file)))
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(`${file}\0`)
    hash.update(readFileSync(resolve(root, file)))
    hash.update('\0')
  }
  return { files, sha256: hash.digest('hex') }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function fixed(value: number): string {
  return value.toFixed(3)
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function pass(value: boolean): string {
  return value ? 'pass' : 'fail'
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  await runRepresentative(
    process.argv[2] ??
      join(
        process.cwd(),
        'docs/research/artifacts/rotation-wildcard/representative-v2',
      ),
  )
}

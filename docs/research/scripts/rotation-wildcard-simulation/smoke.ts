import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluateScenario, type EvaluationRow } from './evaluator'
import { buildScenarioManifest } from './manifest'
import { buildRepresentativeProtocol } from './protocol'

const ARTIFACT_FILES = [
  'protocol.json',
  'primary.csv',
  'summary.json',
  'report.md',
] as const

export function runSmoke(outputDirectory: string): void {
  if (!basename(outputDirectory).toLowerCase().includes('smoke')) {
    throw new Error('Smoke evidence requires a smoke-labeled output path')
  }

  const representative = buildRepresentativeProtocol()
  const cells = [
    representative.cells.find(
      (cell) =>
        cell.mode === 'doubles' &&
        cell.participantCount === 8 &&
        cell.attendanceFamily === 'late-join' &&
        cell.durationFamily === 'variable' &&
        cell.ratingProfile === 'continuous',
    )!,
    representative.cells.find(
      (cell) =>
        cell.mode === 'singles' &&
        cell.participantCount === 7 &&
        cell.attendanceFamily === 'late-join' &&
        cell.durationFamily === 'variable' &&
        cell.ratingProfile === 'extreme',
    )!,
  ]
  const seeds = representative.seeds.slice(0, 2)
  const candidateBand = 1
  const rows = cells.flatMap((cell) =>
    seeds.flatMap((seed) =>
      evaluateScenario({
        manifest: buildScenarioManifest({ cell, seed, rounds: 12 }),
        candidateBand,
      }),
    ),
  )
  const protocol = {
    schemaVersion: 1,
    runKind: 'smoke',
    promotionEligible: false,
    candidateBand,
    cells: cells.map((cell) => cell.id),
    seeds,
    methods: ['A', 'B', 'C', 'D'],
    representativeProtocolSha256: sha256(
      Buffer.from(`${JSON.stringify(representative)}\n`),
    ),
  }
  const summary = smokeSummary(rows, candidateBand)
  const report = [
    '# Rotation wildcard smoke report',
    '',
    '> Development smoke only. This output cannot authorize a production fairness band.',
    '',
    `- Candidate band: ${candidateBand}`,
    `- Cells: ${cells.length}`,
    `- Seeds per cell: ${seeds.length}`,
    `- Primary rows: ${rows.length}`,
    `- A repeat rate: ${summary.repeatRates.A.toFixed(6)}`,
    `- D repeat rate: ${summary.repeatRates.D.toFixed(6)}`,
    '',
  ].join('\n')

  const output = resolve(outputDirectory)
  const staging = `${output}.tmp-${process.pid}`
  const backup = `${output}.backup-${process.pid}`
  mkdirSync(dirname(output), { recursive: true })
  rmSync(staging, { recursive: true, force: true })
  rmSync(backup, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  try {
    writeFileSync(join(staging, 'protocol.json'), canonicalJson(protocol))
    writeFileSync(join(staging, 'primary.csv'), rowsToCsv(rows))
    writeFileSync(join(staging, 'summary.json'), canonicalJson(summary))
    writeFileSync(join(staging, 'report.md'), report)
    const receipt = {
      schemaVersion: 1,
      runKind: 'smoke',
      promotionEligible: false,
      sha256: Object.fromEntries(
        ARTIFACT_FILES.map((file) => [
          file,
          sha256(readFileSync(join(staging, file))),
        ]),
      ),
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
}

function smokeSummary(rows: readonly EvaluationRow[], candidateBand: number) {
  const repeatRates = Object.fromEntries(
    (['A', 'B', 'C', 'D'] as const).map((method) => {
      const methodRows = rows.filter((row) => row.method === method)
      const opportunities = methodRows.reduce(
        (total, row) => total + row.eligibleOpportunities,
        0,
      )
      const repeats = methodRows.reduce(
        (total, row) => total + row.actualRepeatCount,
        0,
      )
      return [method, opportunities === 0 ? 0 : repeats / opportunities]
    }),
  )
  return {
    schemaVersion: 1,
    runKind: 'smoke',
    promotionEligible: false,
    candidateBand,
    rowCount: rows.length,
    repeatRates,
  }
}

function rowsToCsv(rows: readonly EvaluationRow[]): string {
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
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    '',
  ].join('\n')
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

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  runSmoke(
    process.argv[2] ??
      join(process.cwd(), 'docs/research/artifacts/rotation-wildcard/smoke'),
  )
  console.log('Rotation wildcard smoke artifacts written')
}

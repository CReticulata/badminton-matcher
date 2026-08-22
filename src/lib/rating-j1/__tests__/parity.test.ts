import { describe, expect, it } from 'vitest'
import { AuditedJ1Lifecycle, InMemoryJ1RetentionStore } from '../causal'
import { endpointDistribution, integratedEndpointPrediction, isLegalEndpoint, LEGAL_ENDPOINT_SCORES } from '../endpoint'
import { J1Filter, type J1PregameView } from '../filter'
import { GAUSS_HERMITE_31 } from '../quadrature'
import { selectJ1CT96, type J1SelectorEvent } from '../selection'
import { canonicalJson, parseAndVerifyGoldenFixture, sha256Hex, type GoldenFixture } from '../serialization'

const rawFiles = import.meta.glob('../../../../analysis/fixtures/j1-ts-parity/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const SHA256 = /^[0-9a-f]{64}$/
const FLOAT_HEX = /^[0-9a-f]{16}$/
const ABS_TOLERANCE = 1e-12
const REL_TOLERANCE = 1e-12

type JsonRecord = Record<string, unknown>
type ManifestCase = { readonly path: string; readonly sourceCaseId: string; readonly sha256: string }
type Manifest = { readonly schema: string; readonly generatorVersion: string; readonly oracleRevision: JsonRecord; readonly cases: readonly ManifestCase[]; readonly caseManifestDigest: string }
type Metrics = { worstAbsolute: number; worstRelative: number; worstMatrix: number; absoluteAt: string; relativeAt: string; matrixAt: string }

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RangeError(`${label} must be an object`)
  return value as JsonRecord
}

function fromHex(hex: string): number {
  if (!FLOAT_HEX.test(hex)) throw new RangeError(`invalid scientific hex ${hex}`)
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return new DataView(bytes.buffer).getFloat64(0, false)
}
function toHex(value: number): string {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value, false)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
function digestOnly(value: unknown, label: string): void {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new RangeError(`${label} must be a lowercase SHA-256 oracle-only digest`)
}
function compareExact(actual: unknown, expected: unknown, field: string): void { expect(actual, field).toEqual(expected) }
function compareNumber(actual: number, expectedHex: string, field: string, metrics: Metrics, matrix = false): void {
  const expected = fromHex(expectedHex)
  const absolute = Math.abs(actual - expected)
  const relative = absolute / Math.max(Math.abs(expected), Number.MIN_VALUE)
  if (absolute > metrics.worstAbsolute) { metrics.worstAbsolute = absolute; metrics.absoluteAt = field }
  if (relative > metrics.worstRelative) { metrics.worstRelative = relative; metrics.relativeAt = field }
  if (matrix && absolute > metrics.worstMatrix) { metrics.worstMatrix = absolute; metrics.matrixAt = field }
  expect(absolute, `${field}: abs=${absolute} actual=${toHex(actual)} expected=${expectedHex}`).toBeLessThanOrEqual(ABS_TOLERANCE)
  expect(relative, `${field}: rel=${relative} actual=${toHex(actual)} expected=${expectedHex}`).toBeLessThanOrEqual(REL_TOLERANCE)
}
function newMetrics(): Metrics { return { worstAbsolute: 0, worstRelative: 0, worstMatrix: 0, absoluteAt: 'exact', relativeAt: 'exact', matrixAt: 'exact' } }

async function preflight(files: Record<string, string>): Promise<{ manifest: Manifest; fixtures: Map<string, GoldenFixture> }> {
  const manifestPath = Object.keys(files).find((path) => path.endsWith('/manifest.json'))
  if (manifestPath === undefined) throw new RangeError('missing fixture manifest')
  const parsed = record(JSON.parse(files[manifestPath]), 'manifest')
  const manifest = parsed as unknown as Manifest
  const keys = Object.keys(parsed).sort()
  if (keys.join('\u0000') !== ['caseManifestDigest', 'cases', 'generatorVersion', 'oracleRevision', 'schema'].join('\u0000')) throw new RangeError('manifest schema keys are invalid')
  if (manifest.schema !== 'rating-j1-golden-manifest/v1' || manifest.generatorVersion !== 'j1-ts-parity-golden-v1') throw new RangeError('manifest schema or generator mismatch')
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0 || !SHA256.test(manifest.caseManifestDigest)) throw new RangeError('manifest cases or digest invalid')
  record(manifest.oracleRevision, 'manifest oracleRevision')
  if (await sha256Hex(canonicalJson(manifest.cases)) !== manifest.caseManifestDigest) throw new RangeError('manifest caseManifestDigest mismatch')
  const listedPaths = new Set<string>(), caseIds = new Set<string>()
  for (const item of manifest.cases) {
    record(item, 'manifest case')
    if (Object.keys(item).sort().join('\u0000') !== ['path', 'sha256', 'sourceCaseId'].join('\u0000') || typeof item.path !== 'string' || typeof item.sourceCaseId !== 'string' || !SHA256.test(item.sha256) || !/^[a-z0-9-]+\.json$/.test(item.path) || item.path !== `${item.sourceCaseId}.json` || listedPaths.has(item.path) || caseIds.has(item.sourceCaseId)) throw new RangeError('manifest has duplicate or noncanonical case path/id')
    listedPaths.add(item.path); caseIds.add(item.sourceCaseId)
  }
  const actual = new Set(Object.keys(files).filter((path) => path.endsWith('.json') && !path.endsWith('/manifest.json')).map((path) => path.slice(path.lastIndexOf('/') + 1)))
  if (actual.size !== listedPaths.size || [...actual].some((path) => !listedPaths.has(path))) throw new RangeError('actual fixture set differs from manifest')
  const fixtures = new Map<string, GoldenFixture>()
  for (const item of manifest.cases) {
    const rawPath = `${manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1)}${item.path}`
    const raw = files[rawPath]
    if (raw === undefined) throw new RangeError(`listed fixture missing: ${item.path}`)
    const document = JSON.parse(raw)
    if (raw !== canonicalJson(document) || await sha256Hex(raw) !== item.sha256) throw new RangeError(`canonical file SHA mismatch: ${item.sourceCaseId}`)
    const fixture = await parseAndVerifyGoldenFixture(raw, item.sourceCaseId)
    if (canonicalJson(fixture.oracleRevision) !== canonicalJson(manifest.oracleRevision)) throw new RangeError(`oracleRevision mismatch: ${item.sourceCaseId}`)
    fixtures.set(item.sourceCaseId, fixture)
  }
  return { manifest, fixtures }
}

function endpointCase(fixture: GoldenFixture, metrics: Metrics): void {
  const input = fixture.input as { endpoints: [number, number][]; meanHex: string }
  const expected = fixture.expected as JsonRecord
  const gh = expected.gaussHermite31 as { nodesHex: string[]; normalizedWeightsHex: string[] }
  compareExact(input.endpoints, [[15, 10], [10, 15], [21, 20], [20, 21]], 'endpoint/input/endpoints')
  compareExact(Array.from(GAUSS_HERMITE_31.nodes, toHex), gh.nodesHex, 'endpoint/GH/nodes')
  compareExact(Array.from(GAUSS_HERMITE_31.normalizedWeights, toHex), gh.normalizedWeightsHex, 'endpoint/GH/weights')
  compareExact(LEGAL_ENDPOINT_SCORES, expected.legalEndpointScores, 'endpoint/legal scores')
  for (const [a, b] of expected.legalEndpointScores as [number, number][]) expect(isLegalEndpoint(a, b), `endpoint/legal/${a}-${b}`).toBe(true)
  const prediction = expected.integratedPrediction as JsonRecord
  const result = integratedEndpointPrediction(fromHex(prediction.latentMeanHex as string), fromHex(prediction.latentVarianceHex as string), input.endpoints[0][0], input.endpoints[0][1])
  expect(result, 'endpoint/integrated prediction').not.toBeNull()
  compareExact(toHex(result!.latentMean), prediction.latentMeanHex, 'endpoint/integrated/latentMean')
  compareExact(toHex(result!.latentVariance), prediction.latentVarianceHex, 'endpoint/integrated/latentVariance')
  compareExact(toHex(result!.endpointProbability), prediction.endpointProbabilityHex, 'endpoint/integrated/probability')
  compareExact(toHex(result!.endpointNll), prediction.endpointNllHex, 'endpoint/integrated/nll')
  compareNumber(result!.winnerProbabilityA, prediction.winnerProbabilityAHex as string, 'endpoint/integrated/winnerProbabilityA', metrics)
  compareExact(result!.winner, prediction.winner, 'endpoint/integrated/winner')
  compareNumber(endpointDistribution(fromHex(input.meanHex))[20], expected.mirrorProbabilityHex as string, 'endpoint/mirror/probability', metrics)
  compareNumber(endpointDistribution(-fromHex(input.meanHex))[21], expected.mirrorComplementHex as string, 'endpoint/mirror/complement', metrics)
  compareNumber(endpointDistribution(fromHex(input.meanHex))[40], expected.edgeEndpointProbabilityHex as string, 'endpoint/edge/probability', metrics)
  compareNumber(endpointDistribution(-fromHex(input.meanHex))[41], expected.edgeMirrorEndpointProbabilityHex as string, 'endpoint/edge/mirror', metrics)
  const filter = new J1Filter([0, 1, 2, 3], { sigma: 0.035 })
  const view: J1PregameView = { eventId: 'edge-update', activityId: 0, gameIndex: 0, completedAtMinute: 100, activityAttendees: [0, 1, 2, 3], teamA: [0, 1], teamB: [2, 3], targetPoints: 15, winBy: 2, capPoints: 21 }
  const oneStep = expected as { oneStepDeltaWeeksHex: string[]; oneStepLatentMeanHex: string; oneStepLatentVarianceHex: string; oneStepPregameCovarianceHex: string[][]; oneStepPostCovarianceHex: string[][] }
  const preparation = filter.prepare(view)
  compareExact(toHex(preparation.prediction.latentMean), oneStep.oneStepLatentMeanHex, 'endpoint/one-step/latentMean')
  compareExact(toHex(preparation.prediction.latentVariance), oneStep.oneStepLatentVarianceHex, 'endpoint/one-step/latentVariance')
  preparation.deltaWeeks.forEach((value, index) => compareNumber(value, oneStep.oneStepDeltaWeeksHex[index], `endpoint/one-step/delta/${index}`, metrics))
  filter.snapshot().state.covariance.forEach((value, index) => compareNumber(value, oneStep.oneStepPregameCovarianceHex.flat()[index], `endpoint/one-step/pregameCovariance/${index}`, metrics, true))
  filter.commit(view, preparation, 21, 20)
  filter.detachedClose(0).covariance.forEach((value, index) => compareNumber(value, oneStep.oneStepPostCovarianceHex.flat()[index], `endpoint/one-step/postCovariance/${index}`, metrics, true))
  digestOnly(expected.postUpdateStateDigest, 'endpoint/postUpdateStateDigest')
}
function activityCase(fixture: GoldenFixture, metrics: Metrics): void {
  const input = fixture.input as { events: Array<J1PregameView & { scoreA: number; scoreB: number }> }
  type CloseOracle = { activityId: number; roster: number[]; meanHex: string[]; covarianceHex: string[][]; clocks: number[]; postCloseStateDigest: string }
  const expected = fixture.expected as { activity0Close: CloseOracle; activity1Close: CloseOracle; activityBefore: number; activityAfter: number; closed: boolean; clocksAfterTransition: string[]; jointDimensionAfterFirst: number; finalStateDigest: string }
  const filter = new J1Filter(expected.activity0Close.roster, { sigma: 0.035 })
  const closes: ReturnType<J1Filter['detachedClose']>[] = []
  for (const [index, event] of input.events.entries()) {
    const { scoreA, scoreB, ...view } = event
    filter.commit(view, filter.prepare(view), scoreA, scoreB)
    compareExact(filter.activeActivityId, index === 0 ? expected.activityBefore : expected.activityAfter, `activity/event${index}/activeActivityId`)
    if (index === 0) compareExact(filter.currentJointDimension, expected.jointDimensionAfterFirst, 'activity/event0/jointDimension')
    closes.push(filter.detachedClose(event.activityId))
  }
  compareExact(expected.closed, true, 'activity/closed')
  compareExact(filter.playerClocks.map((value) => toHex(value!)), expected.clocksAfterTransition, 'activity/clocksAfterTransition')
  for (const [label, close] of [['activity0', closes[0]], ['activity1', closes[1]]] as const) {
    const oracle = label === 'activity0' ? expected.activity0Close : expected.activity1Close
    compareExact(close.activityId, oracle.activityId, `${label}/activityId`)
    compareExact(close.roster, oracle.roster, `${label}/roster`)
    compareExact(close.clocks, oracle.clocks, `${label}/clocks`)
    close.mean.forEach((value, index) => compareNumber(value, oracle.meanHex[index], `${label}/mean/${index}`, metrics))
    close.covariance.forEach((value, index) => compareNumber(value, oracle.covarianceHex.flat()[index], `${label}/covariance/${index}`, metrics, true))
    digestOnly(oracle.postCloseStateDigest, `${label}/postCloseStateDigest`)
  }
  digestOnly(expected.finalStateDigest, 'activity/finalStateDigest')
}
function causalCase(fixture: GoldenFixture): void {
  const input = fixture.input as { first: J1PregameView & { scoreA: number; scoreB: number }; illegal: J1PregameView & { scoreA: number; scoreB: number }; regression: J1PregameView & { scoreA: number; scoreB: number } }
  const expected = fixture.expected as { clockAfterFirstCommit: string[]; oneStepPostStateDigest: string; rejections: JsonRecord }
  const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, new InMemoryJ1RetentionStore())
  const { scoreA, scoreB, ...first } = input.first
  const receipt = lifecycle.retain(lifecycle.prepare(first)); lifecycle.commit(input.first, receipt)
  compareExact(lifecycle.playerClocks.map((value) => toHex(value!)), expected.clockAfterFirstCommit, 'causal/first/clocks')
  const before = lifecycle.snapshot()
  expect(() => lifecycle.prepare(input.first as J1PregameView)).toThrow(RangeError); compareExact(lifecycle.snapshot(), before, 'causal/duplicate/no-change')
  expect(() => lifecycle.prepare(input.regression as J1PregameView)).toThrow(RangeError); compareExact(lifecycle.snapshot(), before, 'causal/regression/no-change')
  const leftStore = new InMemoryJ1RetentionStore()
  const leftLifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, leftStore)
  const foreignStore = new InMemoryJ1RetentionStore()
  const next = { ...first, eventId: 'foreign', gameIndex: 1, completedAtMinute: first.completedAtMinute + 1 }
  const foreignToken = leftLifecycle.prepare(next)
  const foreignReceipt = foreignStore.retain('J1-CT-96', next, foreignToken)
  const foreignBefore = leftLifecycle.snapshot()
  expect(() => leftLifecycle.commit({ ...next, scoreA: 15, scoreB: 10 }, foreignReceipt)).toThrow(RangeError)
  compareExact(leftLifecycle.snapshot(), foreignBefore, 'causal/staleForeign/no-change')
  const illegal = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 })
  const { scoreA: _illegalA, scoreB: _illegalB, ...illegalView } = input.illegal
  const illegalBefore = illegal.snapshot()
  expect(() => illegal.prepare(illegalView)).toThrow(RangeError); compareExact(illegal.snapshot(), illegalBefore, 'causal/illegal/no-scientific-change')
  compareExact(expected.rejections, { duplicateEvent: 'ValueError', illegalEndpoint: 'ValueError', staleForeignPreparation: 'ValueError', timeRegression: 'ValueError' }, 'causal/rejection surfaces')
  digestOnly(expected.oneStepPostStateDigest, 'causal/oneStepPostStateDigest')
}
async function selectorCase(fixture: GoldenFixture, metrics: Metrics): Promise<void> {
  const input = fixture.input as { aggregation: string; gamesPerActivity: number; roster: number[]; sigmaGridHex: string[]; tieToleranceHex: string; validationWindow: number[]; prefix: J1SelectorEvent[] }
  const expected = fixture.expected as { gridHex: string[]; prefixDigest: string; selectedSigmaHex: string; surface: { sigmaHex: string; validationNllHex: string }[] }
  compareExact(input.aggregation, 'activity-equal-endpoint-nll', 'selector/input/aggregation')
  compareExact(input.gamesPerActivity, 12, 'selector/input/gamesPerActivity')
  compareExact(input.sigmaGridHex, expected.gridHex, 'selector/input/sigmaGrid')
  compareExact(input.tieToleranceHex, toHex(1e-12), 'selector/input/tieTolerance')
  compareExact(input.validationWindow, [96, 144], 'selector/input/validationWindow')
  expect(input.prefix).toHaveLength(1728)
  compareExact(await sha256Hex(canonicalJson(input.prefix)), expected.prefixDigest, 'selector/prefixDigest')
  const selection = selectJ1CT96(input.roster, input.prefix)
  compareExact(selection.method, 'J1-CT-96', 'selector/method')
  compareExact(selection.sigmaGrid.map(toHex), expected.gridHex, 'selector/grid')
  compareExact(toHex(selection.selectedSigma), expected.selectedSigmaHex, 'selector/selectedSigma')
  compareExact(selection.surface.length, expected.surface.length, 'selector/surface length')
  selection.surface.forEach((row, index) => {
    compareExact(toHex(row.sigma), expected.surface[index].sigmaHex, `selector/surface/${index}/sigma`)
    compareNumber(row.validationNll, expected.surface[index].validationNllHex, `selector/surface/${index}/validationNll`, metrics)
  })
}

const registry: Record<string, (fixture: GoldenFixture, metrics: Metrics) => void | Promise<void>> = {
  'j1-endpoint-mirrors-and-edges': endpointCase,
  'j1-activity-transition-close': activityCase,
  'j1-causal-rejections-and-clocks': (fixture) => causalCase(fixture),
  'j1-selector-surface': selectorCase,
}

describe('J1 manifest-driven cross-language parity', () => {
  it('rejects collection/provenance tampering before scientific execution', async () => {
    const manifestPath = Object.keys(rawFiles).find((path) => path.endsWith('/manifest.json'))!
    await expect(preflight({ ...rawFiles, [`${manifestPath.slice(0, -'manifest.json'.length)}unlisted.json`]: '{}' })).rejects.toThrow(/fixture set/)
    const tampered = { ...rawFiles, [manifestPath]: rawFiles[manifestPath].replace('74ad2207', '04ad2207') }
    await expect(preflight(tampered)).rejects.toThrow(/caseManifestDigest/)
    const endpointPath = Object.keys(rawFiles).find((path) => path.endsWith('/j1-endpoint-mirrors-and-edges.json'))!
    await expect(preflight({ ...rawFiles, [endpointPath]: rawFiles[endpointPath].replace('"canonicalInputDigest":"96d8', '"canonicalInputDigest":"06d8') })).rejects.toThrow(/SHA mismatch|digest mismatch/)
    await expect(preflight({ ...rawFiles, [endpointPath]: `${rawFiles[endpointPath]}\n` })).rejects.toThrow(/canonical file SHA/)
    const manifest = JSON.parse(rawFiles[manifestPath]) as Manifest
    const duplicateManifest = { ...manifest, cases: [...manifest.cases, manifest.cases[0]] }
    duplicateManifest.caseManifestDigest = await sha256Hex(canonicalJson(duplicateManifest.cases))
    await expect(preflight({ ...rawFiles, [manifestPath]: canonicalJson(duplicateManifest) })).rejects.toThrow(/duplicate/)
  })

  it('emits field diagnostics for numeric drift and keeps selected sigma exact', () => {
    const metrics = newMetrics()
    expect(() => compareNumber(1 + 2e-12, toHex(1), 'case/event/field', metrics)).toThrow(/case\/event\/field: abs=/)
    expect(() => compareExact(toHex(0.02 + Number.EPSILON), toHex(0.02), 'selector/selectedSigma')).toThrow(/selector\/selectedSigma/)
  })

  it('consumes every manifest case through its explicit cross-language registry', async () => {
    const { manifest, fixtures } = await preflight(rawFiles)
    const metrics = newMetrics(), consumed = new Set<string>()
    for (const item of manifest.cases) {
      const handler = registry[item.sourceCaseId]
      if (handler === undefined) throw new RangeError(`unknown manifest case ${item.sourceCaseId}`)
      await handler(fixtures.get(item.sourceCaseId)!, metrics); consumed.add(item.sourceCaseId)
    }
    expect(consumed).toEqual(new Set(manifest.cases.map((item) => item.sourceCaseId)))
    expect(Object.keys(registry).sort()).toEqual([...consumed].sort())
    console.info(`J1_PARITY_METRICS ${JSON.stringify(metrics)}`)
  }, 120000)
})

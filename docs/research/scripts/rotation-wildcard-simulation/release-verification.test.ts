import { mkdtempSync, readFileSync } from 'node:fs'
import { cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DENIED_BEHAVIOR_CATEGORY_PATHS,
  assertDeniedBehaviorContract,
  type DeniedBehaviorContractV1,
} from './release-authority'
import {
  entrypointReachableJavaScriptChunks,
  probeBuiltProductionWildcard,
} from './verify-release-authority'

const ROOT = resolve(import.meta.dirname, '../../../..')
const CONTRACT_PATH = join(ROOT, 'docs/decisions/rotation-wildcard-denied-behavior-contract-v1.json')
const DIST_PATH = join(ROOT, 'dist')

function loadContract(): DeniedBehaviorContractV1 {
  return JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as DeniedBehaviorContractV1
}

function sourceBytes(contract: DeniedBehaviorContractV1): Map<string, Buffer> {
  return new Map(contract.sources.map(({ path }) => [path, readFileSync(join(ROOT, path))]))
}

describe('denied-behavior source contract', () => {
  it('accepts only the exact versioned allowlist and current byte hashes', () => {
    const contract = loadContract()
    expect(() => assertDeniedBehaviorContract(contract, sourceBytes(contract))).not.toThrow()

    const missing = structuredClone(contract)
    missing.sources.pop()
    expect(() => assertDeniedBehaviorContract(missing, sourceBytes(contract))).toThrow(/missing|surplus|source/i)

    const surplus = structuredClone(contract)
    surplus.sources.push({ path: 'src/unrelated.ts', sha256: '0'.repeat(64) })
    expect(() => assertDeniedBehaviorContract(surplus, sourceBytes(contract))).toThrow(/missing|surplus|source/i)

    const wrongHash = structuredClone(contract)
    wrongHash.sources[0]!.sha256 = '0'.repeat(64)
    expect(() => assertDeniedBehaviorContract(wrongHash, sourceBytes(contract))).toThrow(/hash|digest/i)
  })

  it.each(Object.keys(DENIED_BEHAVIOR_CATEGORY_PATHS) as (keyof typeof DENIED_BEHAVIOR_CATEGORY_PATHS)[])(
    'rejects source-byte drift in denied category %s',
    (category) => {
      const contract = loadContract()
      const bytes = sourceBytes(contract)
      const path = DENIED_BEHAVIOR_CATEGORY_PATHS[category][0]!
      bytes.set(path, Buffer.concat([bytes.get(path)!, Buffer.from('\n// unauthorized drift')]))
      expect(() => assertDeniedBehaviorContract(contract, bytes)).toThrow(/hash|digest/i)
    },
  )

  it('rejects category path drift even when the source inventory is self-consistent', () => {
    const contract = loadContract()
    const changed = structuredClone(contract)
    changed.categories.probability = [...changed.categories.probability].reverse()
    expect(() => assertDeniedBehaviorContract(changed, sourceBytes(contract))).toThrow(/category|allowlist/i)
  })
})

describe('built production wildcard verification', () => {
  it('limits marker scanning to manifest/index-consistent entrypoint-reachable JavaScript', () => {
    const chunks = entrypointReachableJavaScriptChunks(DIST_PATH)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((path) => path.endsWith('.js'))).toBe(true)

    const temp = mkdtempSync(join(tmpdir(), 'wildcard-unreachable-'))
    return cp(DIST_PATH, temp, { recursive: true }).then(async () => {
      await writeFile(join(temp, 'assets', 'unreachable-decoy.js'), 'rotation-wildcard-generation-release-v1')
      const reachable = entrypointReachableJavaScriptChunks(temp)
      expect(reachable.some((path) => path.endsWith('unreachable-decoy.js'))).toBe(false)
    })
  })

  it('rejects index and Vite manifest entry inconsistencies', async () => {
    const wrongIndex = mkdtempSync(join(tmpdir(), 'wildcard-wrong-index-'))
    await cp(DIST_PATH, wrongIndex, { recursive: true })
    const indexPath = join(wrongIndex, 'index.html')
    await writeFile(indexPath, readFileSync(indexPath, 'utf8').replace(/\/assets\/index-[^"']+\.js/, '/assets/decoy.js'))
    expect(() => entrypointReachableJavaScriptChunks(wrongIndex)).toThrow(/index|manifest/i)

    const wrongManifest = mkdtempSync(join(tmpdir(), 'wildcard-wrong-manifest-'))
    await cp(DIST_PATH, wrongManifest, { recursive: true })
    const manifestPath = join(wrongManifest, '.vite', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    delete manifest['index.html']
    await writeFile(manifestPath, JSON.stringify(manifest))
    expect(() => entrypointReachableJavaScriptChunks(wrongManifest)).toThrow(/index|manifest/i)
  })

  it('executes actual built doubles and singles behavior with valid persisted lineage', async () => {
    const result = await probeBuiltProductionWildcard(DIST_PATH)
    expect(result.doubles.playingCount).toBe(4)
    expect(result.singles.playingCount).toBe(2)
    expect(result.doubles.replacedSeats).toBe(1)
    expect(result.singles.replacedSeats).toBe(1)
  })

  it('rejects a marker-preserving bundle that bypasses wildcard application', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'wildcard-bypass-'))
    await cp(DIST_PATH, temp, { recursive: true })
    const chunks = entrypointReachableJavaScriptChunks(temp)
    const marker = 'rotation-wildcard-generation-release-v1'
    const markerChunk = chunks.find((path) => readFileSync(join(temp, path), 'utf8').includes(marker))!
    const path = join(temp, markerChunk)
    const original = readFileSync(path, 'utf8')
    const beforeMarker = original.slice(Math.max(0, original.indexOf(marker) - 1200), original.indexOf(marker))
    const matches = [...beforeMarker.matchAll(/([A-Za-z_$][\w$]*)\(\{normalProposal:/g)]
    expect(matches.length).toBeGreaterThan(0)
    const callName = matches.at(-1)![1]!
    const bypassed = original.replace(
      new RegExp(`${callName.replace(/[$]/g, '\\$&')}\\(\\{normalProposal:`),
      '(x=>x.normalProposal)({normalProposal:',
    )
    expect(bypassed).toContain(marker)
    await writeFile(path, bypassed)
    await expect(probeBuiltProductionWildcard(temp)).rejects.toThrow(/wildcard|lineage|replacement/i)
  })
})

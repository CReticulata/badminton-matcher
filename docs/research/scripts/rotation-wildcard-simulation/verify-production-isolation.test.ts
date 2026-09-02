import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyProductionIsolation } from './verify-production-isolation'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('production simulation isolation', () => {
  it('accepts a source graph and build output without research imports', () => {
    const root = fixture()

    expect(verifyProductionIsolation(root)).toMatchObject({
      sourceFilesChecked: 2,
      buildFilesChecked: 2,
    })
  })

  it('rejects a src import that reaches docs/research', () => {
    const root = fixture()
    writeFileSync(
      join(root, 'src/main.ts'),
      "import '../docs/research/scripts/rotation-wildcard-simulation/protocol'\n",
    )

    expect(() => verifyProductionIsolation(root)).toThrow(/src import crosses.*docs\/research/i)
  })

  it('rejects simulation markers in the Vite manifest or assets', () => {
    const manifestRoot = fixture()
    writeFileSync(
      join(manifestRoot, 'dist/.vite/manifest.json'),
      JSON.stringify({ simulation: { src: 'docs/research/protocol.ts' } }),
    )
    expect(() => verifyProductionIsolation(manifestRoot)).toThrow(/build output contains forbidden simulation marker/i)

    const assetRoot = fixture()
    writeFileSync(
      join(assetRoot, 'dist/assets/index.js'),
      'const source = "rotation-wildcard-simulation"',
    )
    expect(() => verifyProductionIsolation(assetRoot)).toThrow(/build output contains forbidden simulation marker/i)
  })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'badminton-isolation-'))
  roots.push(root)
  mkdirSync(join(root, 'src/lib'), { recursive: true })
  mkdirSync(join(root, 'docs/research/scripts/rotation-wildcard-simulation'), {
    recursive: true,
  })
  mkdirSync(join(root, 'dist/.vite'), { recursive: true })
  mkdirSync(join(root, 'dist/assets'), { recursive: true })
  writeFileSync(join(root, 'src/main.ts'), "import './lib/value'\n")
  writeFileSync(join(root, 'src/lib/value.ts'), 'export const value = 1\n')
  writeFileSync(
    join(root, 'docs/research/scripts/rotation-wildcard-simulation/protocol.ts'),
    'export const protocol = 1\n',
  )
  writeFileSync(
    join(root, 'dist/.vite/manifest.json'),
    JSON.stringify({ 'src/main.ts': { file: 'assets/index.js', isEntry: true } }),
  )
  writeFileSync(join(root, 'dist/assets/index.js'), 'const value=1;')
  return root
}

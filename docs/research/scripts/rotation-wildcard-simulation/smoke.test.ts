import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runSmoke } from './smoke'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('smoke evidence artifacts', () => {
  it('writes deterministic non-promotable artifacts and verified receipts atomically', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotation-smoke-'))
    roots.push(root)
    const first = join(root, 'smoke-first')
    const second = join(root, 'smoke-second')

    runSmoke(first)
    runSmoke(second)

    const expected = [
      'primary.csv',
      'protocol.json',
      'receipt.json',
      'report.md',
      'summary.json',
    ]
    expect(readdirSync(first).sort()).toEqual(expected)
    expect(readdirSync(second).sort()).toEqual(expected)
    for (const file of expected) {
      expect(readFileSync(join(first, file))).toEqual(readFileSync(join(second, file)))
    }

    const protocol = JSON.parse(readFileSync(join(first, 'protocol.json'), 'utf8'))
    expect(protocol.runKind).toBe('smoke')
    expect(protocol.promotionEligible).toBe(false)
    expect(protocol.seeds.length).toBeLessThan(500)

    const receipt = JSON.parse(readFileSync(join(first, 'receipt.json'), 'utf8'))
    expect(receipt.schemaVersion).toBe(1)
    expect(receipt.runKind).toBe('smoke')
    for (const [file, digest] of Object.entries(receipt.sha256 as Record<string, string>)) {
      expect(sha256(readFileSync(join(first, file)))).toBe(digest)
    }
    expect(readdirSync(root).some((entry) => entry.includes('.tmp-'))).toBe(false)
  })

  it('refuses to write smoke data outside a smoke-labeled path', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotation-evidence-'))
    roots.push(root)

    expect(() => runSmoke(join(root, 'representative'))).toThrow(/smoke-labeled output path/i)
  })
})

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

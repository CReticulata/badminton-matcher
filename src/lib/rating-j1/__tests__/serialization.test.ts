import { describe, expect, it } from 'vitest'
import fixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-endpoint-mirrors-and-edges.json?raw'
import causalFixtureText from '../../../../analysis/fixtures/j1-ts-parity/j1-causal-rejections-and-clocks.json?raw'
import { canonicalJson, parseAndVerifyGoldenFixture, sha256Hex } from '../serialization'

const CASE_ID = 'j1-endpoint-mirrors-and-edges'

describe('rating-j1 golden fixture serialization', () => {
  it('uses sorted compact canonical JSON and verifies the authoritative fixture', async () => {
    expect(canonicalJson({ z: [3, { b: true, a: 'x' }], a: 1 })).toBe('{"a":1,"z":[3,{"a":"x","b":true}]}')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const fixture = await parseAndVerifyGoldenFixture(fixtureText, CASE_ID)
    expect(fixture.schema).toBe('rating-j1-golden/v1')
    expect(fixture.expected.legalEndpointScores).toHaveLength(42)
    const causalFixture = await parseAndVerifyGoldenFixture(causalFixtureText, 'j1-causal-rejections-and-clocks')
    expect(causalFixture.sourceCaseId).toBe('j1-causal-rejections-and-clocks')
  })

  it('rejects malformed or non-finite scientific payloads', async () => {
    await expect(parseAndVerifyGoldenFixture('{', CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"meanHex":"3fd6666666666666"', '"meanHex":"not-hex"'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"meanHex":"3fd6666666666666"', '"meanHex":"7ff0000000000000"'), CASE_ID)).rejects.toThrow(RangeError)
  })

  it('rejects provenance and digest tampering even when numeric payload is unchanged', async () => {
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"gitHead":"7faaa0355e48ea8891acad2d48ee02b42fffb5aa"', '"gitHead":"0faaa0355e48ea8891acad2d48ee02b42fffb5aa"'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"canonicalInputDigest":"96d8', '"canonicalInputDigest":"06d8'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"canonicalOutputDigest":"d8c8', '"canonicalOutputDigest":"08c8'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace('"generatorVersion":"j1-ts-parity-golden-v1"', '"generatorVersion":"j1-ts-parity-golden-v2"'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText.replace(`"sourceCaseId":"${CASE_ID}"`, '"sourceCaseId":"j1-selector-surface"'), CASE_ID)).rejects.toThrow(RangeError)
    await expect(parseAndVerifyGoldenFixture(fixtureText, 'j1-selector-surface')).rejects.toThrow(RangeError)
  })
})

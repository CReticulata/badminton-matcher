function float64FromHex(hex: string): number {
  if (!/^[0-9a-f]{16}$/.test(hex)) throw new RangeError('invalid binary64 hex')
  const bytes = new Uint8Array(8)
  for (let index = 0; index < 8; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return new DataView(bytes.buffer).getFloat64(0, false)
}

const NODE_HEX = [
  'c01bfb93920297ed', 'c01919ae3b6638f4', 'c016b222f2ed9b65', 'c01488cd476a5a08', 'c01286b789045dd7',
  'c010a005b4021c17', 'c00d9b1f5b7e229e', 'c00a1523093e0f36', 'c006a74814e0445f', 'c0034c6d39a4cd23',
  'c00000878dd9c8ac', 'bff9808e75c48df7', 'bff311b92fc673e6', 'bfe95f3f89b3487d', 'bfd95720340ef1ce',
  '0000000000000000', '3fd95720340ef1ce', '3fe95f3f89b3487d', '3ff311b92fc673e6', '3ff9808e75c48df7',
  '400000878dd9c8ac', '40034c6d39a4cd23', '4006a74814e0445f', '400a1523093e0f36', '400d9b1f5b7e229e',
  '4010a005b4021c17', '401286b789045dd7', '401488cd476a5a08', '4016b222f2ed9b65', '401919ae3b6638f4',
  '401bfb93920297ed',
] as const

const WEIGHT_HEX = [
  '3b73b0afc02227a1', '3c4a981f8ff143a2', '3cedfaece81aa354', '3d7276fe49a7c882', '3de23dd9db7d89a8',
  '3e41b4263af1882f', '3e9318b88d513a4f', '3ed8d7fd749b16ba', '3f14a28eb7c2a73d', '3f46cebbc616afee',
  '3f714acabbe4d7cb', '3f92662bbc8132c7', '3fabf03d60c4ad62', '3fbea38d6206fb96', '3fc8770376dcedd5',
  '3fcc94e6ffa4c077', '3fc8770376dcedd5', '3fbea38d6206fb96', '3fabf03d60c4ad62', '3f92662bbc8132c7',
  '3f714acabbe4d7cb', '3f46cebbc616afee', '3f14a28eb7c2a73d', '3ed8d7fd749b16ba', '3e9318b88d513a4f',
  '3e41b4263af1882f', '3de23dd9db7d89a8', '3d7276fe49a7c882', '3cedfaece81aa354', '3c4a981f8ff143a2',
  '3b73b0afc02227a1',
] as const

export const GAUSS_HERMITE_31 = Object.freeze({
  nodes: Object.freeze(NODE_HEX.map(float64FromHex)),
  normalizedWeights: Object.freeze(WEIGHT_HEX.map(float64FromHex)),
})

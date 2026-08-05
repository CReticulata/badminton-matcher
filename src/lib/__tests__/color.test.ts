import { describe, expect, it } from 'vitest'
import { nextDefaultColor, textColorOn } from '../color'

describe('顏色工具', () => {
  it('連續指派 30 人的預設色皆不重複', () => {
    const used: string[] = []
    for (let i = 0; i < 30; i++) {
      const c = nextDefaultColor(used)
      expect(used).not.toContain(c)
      expect(c).toMatch(/^#[0-9a-f]{6}$/i)
      used.push(c)
    }
  })

  it('依底色亮度回傳黑或白文字', () => {
    expect(textColorOn('#ffffff')).toBe('#000000')
    expect(textColorOn('#000000')).toBe('#ffffff')
    expect(textColorOn('#eab308')).toBe('#000000')
    expect(textColorOn('#3b82f6')).toBe('#ffffff')
  })
})

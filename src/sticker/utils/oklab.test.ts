import { describe, expect, it } from 'vitest'
import { colorToOklab, oklabToColor } from './oklab'

describe('Oklab conversion', () => {
  it('agrees with canonical sRGB coordinates', () => {
    const red = colorToOklab('#ff0000')
    expect(red[0]).toBeCloseTo(0.627955, 5)
    expect(red[1]).toBeCloseTo(0.224863, 5)
    expect(red[2]).toBeCloseTo(0.125846, 5)
    expect(colorToOklab('#000000')).toEqual([0, 0, 0])
    const white = colorToOklab('#ffffff')
    expect(white[0]).toBeCloseTo(1, 6)
    expect(white[1]).toBeCloseTo(0, 6)
    expect(white[2]).toBeCloseTo(0, 6)
  })

  it('round trips primaries, neutrals and preset colors', () => {
    for (const color of ['#000000', '#ffffff', '#888888', '#ff0000', '#00ff00', '#0000ff', '#ffa8c2', '#bf5cdb', '#ff9e3d']) {
      expect(oklabToColor(colorToOklab(color))).toBe(color)
    }
  })

  it('reduces out-of-gamut chroma without changing lightness or hue', () => {
    const L = 0.7, a = 0.4, b = 0.15
    const mapped = colorToOklab(oklabToColor([L, a, b]))
    expect(mapped[0]).toBeCloseTo(L, 2)
    expect(Math.atan2(mapped[2], mapped[1])).toBeCloseTo(Math.atan2(b, a), 2)
    expect(Math.hypot(mapped[1], mapped[2])).toBeLessThan(Math.hypot(a, b))
  })
})

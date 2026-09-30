import { describe, expect, it } from 'vitest'
import { colorToHsl } from './colorSpace'
import {
  colorInputValue,
  darken,
  deriveDepthColor,
  deriveHighlightColor,
  lighten,
  randomGradientPair,
  randomVividColors,
  resolveGradientStops,
} from './color'

describe('deriveDepthColor', () => {
  it('keeps hue while producing a darker companion', () => {
    const base = '#4c9acc'
    const depth = deriveDepthColor(base)
    const a = colorToHsl(base)
    const b = colorToHsl(depth)

    expect(Math.abs((a.h ?? 0) - (b.h ?? 0))).toBeLessThan(2)
    expect(b.l).toBeLessThan(a.l)
  })

  it('keeps light colors from becoming too deep or gray', () => {
    const base = '#66ffcc'
    const depth = deriveDepthColor(base)
    const a = colorToHsl(base)
    const b = colorToHsl(depth)

    expect(b.l).toBeLessThan(a.l)
    expect(a.l - b.l).toBeLessThan(0.18)
    expect(b.l).toBeGreaterThan(0.55)
    expect(b.s).toBeGreaterThanOrEqual(0.60)
    expect(b.s).toBeLessThan(a.s)
  })
})

describe('deriveHighlightColor', () => {
  it('keeps hue while producing a lighter companion', () => {
    const base = '#4c9acc'
    const highlight = deriveHighlightColor(base)
    const a = colorToHsl(base)
    const b = colorToHsl(highlight)

    expect(Math.abs((a.h ?? 0) - (b.h ?? 0))).toBeLessThan(2)
    expect(b.l).toBeGreaterThan(a.l)
  })
})

describe('resolveGradientStops', () => {
  it('expands a single color into a [dark, light] pair', () => {
    const base = '#4c9acc'
    const [dark, light] = resolveGradientStops([base])
    expect(colorToHsl(dark).l).toBeLessThan(colorToHsl(base).l)
    expect(colorToHsl(light).l).toBeGreaterThan(colorToHsl(base).l)
    expect(colorToHsl(dark).l).toBeLessThan(colorToHsl(light).l)
  })

  it('passes two/three colors through unchanged', () => {
    expect(resolveGradientStops(['#111111', '#222222'])).toEqual([
      '#111111',
      '#222222',
    ])
    expect(resolveGradientStops(['#111111', '#222222', '#333333'])).toEqual([
      '#111111',
      '#222222',
      '#333333',
    ])
  })

  it('falls back to a default pair when empty', () => {
    expect(resolveGradientStops([]).length).toBe(2)
  })
})

describe('colorInputValue', () => {
  it('normalizes shorthand hex for native color inputs', () => {
    expect(colorInputValue('#9f6')).toBe('#99ff66')
    expect(colorInputValue('#8fd')).toBe('#88ffdd')
  })
})

describe('darken', () => {
  it('scales rgb channels toward black', () => {
    expect(darken('#ffffff', 0.5)).toBe('rgb(128, 128, 128)')
    expect(darken('#808080', 0)).toBe('rgb(128, 128, 128)')
  })
})

describe('randomVividColors', () => {
  it('is deterministic given a seeded random and returns 1 to 3 hex colors', () => {
    let seed = 0.2
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const colors = randomVividColors('#1d8df0', random)
    expect(colors.length).toBeGreaterThanOrEqual(1)
    expect(colors.length).toBeLessThanOrEqual(3)
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('usually returns one color, sometimes two, and rarely three', () => {
    expect(randomVividColors('#76baf4', () => 0.4)).toHaveLength(1)
    expect(randomVividColors('#76baf4', () => 0.7)).toHaveLength(2)
    expect(randomVividColors('#76baf4', () => 0.95)).toHaveLength(3)
  })
})

describe('lighten', () => {
  it('scales rgb channels toward white', () => {
    expect(lighten('#000000', 0.5)).toBe('rgb(128, 128, 128)')
    expect(lighten('#808080', 0)).toBe('rgb(128, 128, 128)')
  })
})

describe('randomGradientPair', () => {
  it('returns two same-family base stops for the byte-style flavor', () => {
    let seed = 0.42
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const colors = randomGradientPair('#1d8df0', random)

    expect(colors).toHaveLength(2)
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
    // 字节范渲染时从基准色派生深轮廓，文字只轻微提亮。
    for (const color of colors) {
      const base = colorToHsl(color).l
      const outline = colorToHsl(darken(color, 0.24)).l
      const foreground = colorToHsl(lighten(color, 0.12)).l
      expect(outline).toBeLessThan(base)
      expect(base - outline).toBeGreaterThan(0.12)
      expect(foreground).toBeGreaterThan(base)
      expect(foreground - base).toBeLessThan(0.08)
    }
  })
})

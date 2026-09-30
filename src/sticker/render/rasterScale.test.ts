import { describe, expect, it } from 'vitest'
import { outputAwareRasterScale, scaleLayout } from './rasterScale'
import { createStickerLayout } from './layout'

const bounds = (width: number, height: number) => ({ minX: 0, minY: 0, maxX: width, maxY: height })

describe('output-aware rasterization', () => {
  it('keeps normal short stickers at their original resolution', () => {
    expect(outputAwareRasterScale(bounds(1500, 330), 30, 150, 2048, 1.5, 330)).toBe(1)
  })

  it('bounds both single-line and multiline long text before allocating canvases', () => {
    for (const [width, height] of [[100000, 330], [6000, 6000], [600, 100000]]) {
      const scale = outputAwareRasterScale(bounds(width, height), 30, 150, 2048, 1.5, 330)
      expect(scale).toBeLessThan(1)
      expect((width + 660) * (height + 660) * scale ** 2).toBeLessThanOrEqual(16_000_001)
      expect(Math.max(width + 660, height + 660) * scale).toBeLessThanOrEqual(16380)
    }
  })

  it('retains more raster detail for higher output and antialiasing settings', () => {
    const size = bounds(3000, 3000)
    const base = outputAwareRasterScale(size, 30, 150, 2048, 1.5, 330)
    expect(outputAwareRasterScale(size, 30, 450, 6144, 1.5, 330)).toBeGreaterThan(base)
    expect(outputAwareRasterScale(size, 30, 150, 2048, 3, 330)).toBeGreaterThan(base)
  })

  it('scales existing geometry without reflowing text or mutating the source', () => {
    const layout = createStickerLayout('勇攀\nHello 🚀', {
      fontSize: 100, alternatingOffset: 8, letterSpacing: -4,
      measureGlyph: () => ({ advanceWidth: 90, left: 0, right: 90, ascent: 80, descent: 20 }),
    })
    const before = structuredClone(layout)
    const scaled = scaleLayout(layout, 0.25)
    expect(layout).toEqual(before)
    expect(scaled.fontSize).toBe(25)
    expect(scaled.placements.map(p => p.grapheme)).toEqual(layout.placements.map(p => p.grapheme))
    scaled.placements.forEach((p, i) => {
      expect(p.x).toBe(layout.placements[i].x * 0.25)
      expect(p.baselineY).toBe(layout.placements[i].baselineY * 0.25)
      expect(p.bounds.maxY).toBe(layout.placements[i].bounds.maxY * 0.25)
    })
  })
})

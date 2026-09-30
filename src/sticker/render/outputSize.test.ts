import { describe, expect, it } from 'vitest'
import { stickerOutputSize } from './outputSize'

const bounds = (width: number, height: number) => ({ minX: 0, minY: 0, maxX: width, maxY: height })

describe('fixed-font sticker output sizing', () => {
  it('keeps the same font size as the canvas grows in either direction', () => {
    for (const [width, height] of [[330, 330], [1650, 330], [660, 660], [330, 1650]]) {
      const result = stickerOutputSize(bounds(width, height), 330, 30, 1)
      expect(330 * result.textHeight / height).toBeCloseTo(72)
    }
  })

  it('shrinks only when the painted area exceeds the pixel budget', () => {
    const result = stickerOutputSize(bounds(3000, 3000), 330, 30, 1)
    const ratio = result.textHeight / 3000
    expect(330 * ratio).toBeLessThan(72)
    expect((3060 * ratio) ** 2).toBeCloseTo(512 ** 2)
  })

  it('limits both very wide and very tall text by the longest edge', () => {
    for (const [width, height] of [[100000, 330], [330, 100000]]) {
      const result = stickerOutputSize(bounds(width, height), 330, 30, 1)
      const ratio = result.textHeight / height
      expect((Math.max(width, height) + 60) * ratio).toBeCloseTo(3072)
      expect(330 * ratio).toBeLessThan(72)
    }
  })

  it('changes continuously when content crosses the area budget', () => {
    const side = 512 * 330 / 72 - 60
    const before = stickerOutputSize(bounds(side, side), 330, 30, 1).textHeight / side
    const after = stickerOutputSize(bounds(side + 1, side + 1), 330, 30, 1).textHeight / (side + 1)
    expect(before * 330).toBeCloseTo(72)
    expect(after * 330).toBeLessThan(72)
    expect((before - after) * 330).toBeLessThan(1)
  })

  it('is independent of internal AA scale and applies export scale once', () => {
    const normal = stickerOutputSize(bounds(3000, 3000), 330, 30, 1)
    expect(stickerOutputSize(bounds(6000, 6000), 660, 60, 1)).toEqual(normal)
    const high = stickerOutputSize(bounds(3000, 3000), 330, 30, 3)
    expect(high.textHeight).toBeCloseTo(normal.textHeight * 3)
    expect(high.maxEdge).toBe(normal.maxEdge * 3)
  })

  it('honors explicit longest-edge limits without forcing smaller text to grow', () => {
    const result = stickerOutputSize(bounds(30000, 330), 330, 30, 3, 1024)
    expect(result.maxEdge).toBe(1024)
    expect((30000 + 60) * result.textHeight / 330).toBeCloseTo(1024)
    expect(stickerOutputSize(bounds(330, 330), 330, 30, 1, 10000).textHeight).toBe(72)
  })
})

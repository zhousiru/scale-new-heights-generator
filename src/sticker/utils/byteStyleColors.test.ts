import { describe, expect, it } from 'vitest'
import { colord } from 'colord'
import { STICKER_PRESET_GROUPS } from '../config/presets'
import { deriveByteStyleColors } from './color'
import { colorToOklab } from './oklab'

// Two opaque RGB gradient planes fitted separately to the supplied reference PNGs.
// Only palette measurements are retained; no reference image/icon assets are bundled.
const reference: Record<string, { foreground: string[]; outline: string[] }> = {
  '丰富生活': { foreground: ['#7cfae2', '#91c6f3'], outline: ['#007cae', '#005359'] },
  '共同成长': { foreground: ['#a9f0b0', '#67c7ee'], outline: ['#316c40', '#106269'] },
  '坦诚清晰': { foreground: ['#ffca89', '#efa181'], outline: ['#ff7307', '#a62904'] },
  '多元兼容': { foreground: ['#fde1f8', '#e991e1'], outline: ['#ff719c', '#9322a8'] },
  '始终创业': { foreground: ['#c7f65c', '#8ce1d0'], outline: ['#939800', '#007e22'] },
  '敢为极致': { foreground: ['#ffcdb1', '#f389b3'], outline: ['#d93fc5', '#991743'] },
  '求真务实': { foreground: ['#56ffe5', '#ff6cfd'], outline: ['#00a79c', '#a12880'] },
  '激发创造': { foreground: ['#6fe2f1', '#82a5e6'], outline: ['#0069c2', '#004978'] },
  '领导力': { foreground: ['#ffec67', '#faa86d'], outline: ['#ff723a', '#7e500a'] },
}

const distance = (a: string, b: string) => {
  const x = colorToOklab(a), y = colorToOklab(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

describe('deriveByteStyleColors', () => {
  it('approximates both reference gradients using two shared midpoint stops', () => {
    const errors: number[] = []
    for (const preset of STICKER_PRESET_GROUPS.字节范) {
      expect(preset.colors).toHaveLength(2)
      const palette = deriveByteStyleColors(preset.colors)
      const target = reference[preset.text]
      const presetErrors: number[] = []
      for (const layer of ['foreground', 'outline'] as const) {
        for (let stop = 0; stop < 2; stop++) presetErrors.push(distance(palette[layer][stop], target[layer][stop]))
      }
      expect(Math.max(...presetErrors)).toBeLessThan(0.08)
      expect(presetErrors.reduce((sum, v) => sum + v, 0) / 4).toBeLessThan(0.045)
      errors.push(...presetErrors)
    }
    expect(errors.reduce((sum, v) => sum + v, 0) / errors.length).toBeLessThan(0.032)
  })

  it('keeps a visible lightness separation across each reference palette', () => {
    for (const preset of STICKER_PRESET_GROUPS.字节范) {
      const { foreground, outline } = deriveByteStyleColors(preset.colors)
      for (let stop = 0; stop < 2; stop++) {
        expect(colorToOklab(foreground[stop])[0] - colorToOklab(outline[stop])[0]).toBeGreaterThan(0.18)
      }
    }
  })

  it('reverses both derived gradients when input stops are reversed', () => {
    const colors = ['#ee8ebf', '#c65479']
    const forward = deriveByteStyleColors(colors)
    const reverse = deriveByteStyleColors([...colors].reverse())
    expect(reverse.foreground).toEqual([...forward.foreground].reverse())
    expect(reverse.outline).toEqual([...forward.outline].reverse())
  })

  it('supports single and three-stop input and keeps neutral colors neutral', () => {
    for (const colors of [['#000000'], ['#eeeeee'], ['#000000', '#888888', '#ffffff']]) {
      const palette = deriveByteStyleColors(colors)
      expect(palette.foreground).toHaveLength(colors.length)
      expect(palette.outline).toHaveLength(colors.length)
      for (const color of [...palette.foreground, ...palette.outline]) {
        const { r, g, b } = colord(color).toRgb()
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1)
      }
    }
  })
})

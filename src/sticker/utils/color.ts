import { colorToOklab, oklabToColor, type Oklab } from './oklab'
import { colorToHsl, colorToRgb, hslToRgb, rgbToHex } from './colorSpace'
import { BYTE_STYLE_CALIBRATION } from '../config/byteStyleCalibration'
import type { StickerFlavor } from '../config/defaults'

function adjustHsl(base: string, adjustment: { lightness: number; saturation: number }): string {
  const color = colorToHsl(base)
  return rgbToHex(
    hslToRgb({
      ...color,
      l: color.l + adjustment.lightness,
      s: color.s + adjustment.saturation,
    }),
  )
}

// 同色相的深端：轻微降低饱和度，避免高饱和浅色变深后刺眼。
export function deriveDepthColor(base: string): string {
  return adjustHsl(base, { lightness: -0.12, saturation: -0.05 })
}

// 深端保留输入色；浅端向亮的中性色靠近，字节范需给字面提亮留出空间。
const SINGLE_COLOR_TONES = {
  snh: { maxLightness: 0.92, highlightMix: 0.70 },
  bs: { maxLightness: 0.78, highlightMix: 0.40 },
} as const

// 单色只派生亮端，不额外加深输入色；双色和三色保留用户设置。
export function resolveGradientStops(colors: string[], flavor: StickerFlavor = 'snh'): string[] {
  if (colors.length <= 1) {
    const base = colors[0] ?? '#76baf4'
    const [lightness, a, b] = colorToOklab(base)
    const tones = SINGLE_COLOR_TONES[flavor]
    const lift = Math.max(0, tones.maxLightness - lightness) * tones.highlightMix
    // 在 Oklab 中朝白色混合，提亮时同步降低色度，保留同色系的淡色倾向。
    const chromaScale = lightness < 1 ? 1 - lift / (1 - lightness) : 1
    return [base, oklabToColor([lightness + lift, a * chromaScale, b * chromaScale])]
  }
  return colors
}

export function colorInputValue(color: string): string {
  return rgbToHex(colorToRgb(color))
}

// 通道级压暗：按 (1-amount) 缩放 RGB。用于 snh 边缘轮廓加深。
export function darken(color: string, amount: number): string {
  const { r, g, b } = colorToRgb(color)
  const scale = (channel: number) => {
    const byte = Math.round(channel * 255)
    return Math.max(0, Math.min(255, Math.round(byte * (1 - amount))))
  }
  return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`
}

/** 以基准色为中点，在 Oklab 中拆出文字和轮廓的明度、色度差。
 * 邻色参与校准，使双色渐变两端保持协调，无需为每个预设维护独立规则。 */
export function deriveByteStyleColors(colors: string[]): {
  foreground: string[]
  outline: string[]
} {
  const stops = colors.map(colorToOklab)
  const foreground: string[] = []
  const outline: string[] = []
  for (const [index, color] of stops.entries()) {
    const previous = stops[index - 1]
    const next = stops[index + 1]
    const neighbor: Oklab =
      previous && next
        ? [(previous[0] + next[0]) / 2, (previous[1] + next[1]) / 2, (previous[2] + next[2]) / 2]
        : (previous ?? next ?? color)
    const features = [1, ...color, ...neighbor.map((value, channel) => value - color[channel])]
    const split = BYTE_STYLE_CALIBRATION.split.map((row) =>
      row.reduce((sum, value, channel) => sum + value * features[channel], 0),
    )
    // 保留可见的明度差，同时避免灰色输入染上彩色。
    const { minLightnessSplit, maxLightnessSplit, neutralChroma } = BYTE_STYLE_CALIBRATION
    const lightness = Math.max(minLightnessSplit, Math.min(maxLightnessSplit, split[0]))
    const chromaWeight = Math.min(1, Math.hypot(color[1], color[2]) / neutralChroma)
    const a = split[1] * chromaWeight
    const b = split[2] * chromaWeight
    foreground.push(oklabToColor([color[0] + lightness, color[1] + a, color[2] + b]))
    outline.push(oklabToColor([color[0] - lightness, color[1] - a, color[2] - b]))
  }
  return { foreground, outline }
}

import { colord } from 'colord'
import { convertRgbToOklab, convertOklabToRgb } from 'culori/fn'

export type Oklab = readonly [lightness: number, a: number, b: number]

export function colorToOklab(color: string): Oklab {
  const { r, g, b } = colord(color).toRgb()
  const converted = convertRgbToOklab({ r: r / 255, g: g / 255, b: b / 255 })
  return [converted.l, converted.a, converted.b]
}

function rgb([l, a, b]: Oklab): readonly number[] {
  const converted = convertOklabToRgb({ l, a, b })
  return [converted.r, converted.g, converted.b]
}

/** Reduce out-of-gamut chroma at fixed lightness and hue. Low-level Culori
 * converters keep the bundle small without registering CSS parsers or modes. */
export function oklabToColor([lightness, a, b]: Oklab): string {
  const L = Math.max(0, Math.min(1, lightness))
  const inGamut = (channels: readonly number[]) => channels.every((v) => v >= -1e-7 && v <= 1 + 1e-7)
  let channels = rgb([L, a, b])
  if (!inGamut(channels)) {
    let lower = 0, upper = 1
    for (let step = 0; step < 16; step++) {
      const scale = (lower + upper) / 2
      if (inGamut(rgb([L, a * scale, b * scale]))) lower = scale
      else upper = scale
    }
    channels = rgb([L, a * lower, b * lower])
  }
  return colord({ r: channels[0] * 255, g: channels[1] * 255, b: channels[2] * 255 }).toHex()
}

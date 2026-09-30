import {
  parse,
  parseHex,
  parseRgb,
  parseRgbLegacy,
  parseHsl,
  parseHslLegacy,
  useParser,
  convertHslToRgb,
  convertRgbToHsl,
  serializeHex,
  serializeHex8,
  type Rgb,
  type Hsl,
} from 'culori/fn'

// Keep hex and both CSS RGB/HSL syntaxes, without registering interpolation,
// named colors or additional color spaces. @types/culori omits the undefined
// parser result from useParser's callback type; these are Culori's own parsers.
for (const parser of [parseHex, parseRgb, parseRgbLegacy, parseHsl, parseHslLegacy]) {
  useParser(parser as (color: string) => Rgb | Hsl)
}
const BLACK: Rgb = { mode: 'rgb', r: 0, g: 0, b: 0 }

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function colorToRgb(color: string): Rgb {
  const colorSpace = parse(color.trim().toLowerCase())
  const parsed = colorSpace?.mode === 'rgb' ? colorSpace
    : colorSpace?.mode === 'hsl' ? hslToRgb(colorSpace) : BLACK
  return {
    ...parsed,
    r: clampUnit(parsed.r ?? 0),
    g: clampUnit(parsed.g ?? 0),
    b: clampUnit(parsed.b ?? 0),
    ...(parsed.alpha !== undefined ? { alpha: clampUnit(parsed.alpha) } : {}),
  }
}

export function colorToHsl(color: string): Hsl {
  return convertRgbToHsl(colorToRgb(color))
}

export function hslToRgb(color: Hsl): Rgb {
  return convertHslToRgb({ ...color, s: clampUnit(color.s), l: clampUnit(color.l) })
}

export function rgbToHex(color: Rgb): string {
  return color.alpha !== undefined && color.alpha < 1
    ? serializeHex8(color)
    : serializeHex(color)
}

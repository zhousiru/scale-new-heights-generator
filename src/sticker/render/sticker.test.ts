import { describe, expect, it } from 'vitest'
import { DEFAULT_STICKER_CONTROLS, normalizeStickerControls } from '../config/defaults'
import {
  classifyGrapheme,
  createStickerLayout,
  isEmojiGrapheme,
  measureSkewedGlyphBounds,
} from './layout'
import { isChineseDominant, usesFeatureFont } from './font'
import { findOpaqueBounds } from './canvas'
import { splitGraphemes } from '../../shared/render/input'
import type { GlyphMeasurement } from './types'

function createMeasurement(width: number, fontSize: number): GlyphMeasurement {
  return {
    advanceWidth: width,
    left: 2,
    right: width - 2,
    ascent: fontSize * 0.78,
    descent: fontSize * 0.22,
  }
}

describe('splitGraphemes', () => {
  it('keeps Chinese text segmented by grapheme', () => {
    expect(splitGraphemes('勇攀高峰')).toEqual(['勇', '攀', '高', '峰'])
  })

  it('保持组合音标、连字 Emoji 和旗帜完整', () => {
    expect(splitGraphemes('e\u0301👨‍👩‍👧‍👦🇨🇳')).toEqual(['e\u0301', '👨‍👩‍👧‍👦', '🇨🇳'])
  })
})

describe('usesFeatureFont', () => {
  it('uses feature fonts only for the intended scripts', () => {
    expect(usesFeatureFont('snh', '高')).toBe(true)
    expect(usesFeatureFont('snh', '〇')).toBe(true)
    expect(usesFeatureFont('snh', 'あ')).toBe(false)
    expect(usesFeatureFont('snh', '가')).toBe(false)
    expect(usesFeatureFont('snh', '㐀')).toBe(false)
    expect(usesFeatureFont('snh', '𠀀')).toBe(false)
    // snh 西文/数字仅在中文占多数时随特色字体排版。
    expect(usesFeatureFont('snh', 'A', true)).toBe(true)
    expect(usesFeatureFont('snh', '1', true)).toBe(true)
    expect(usesFeatureFont('snh', 'A', false)).toBe(false)
    expect(usesFeatureFont('snh', '1', false)).toBe(false)
    // bs 中英文与数字全部走优设标题黑。
    expect(usesFeatureFont('bs', '高')).toBe(true)
    expect(usesFeatureFont('bs', 'A')).toBe(true)
    expect(usesFeatureFont('bs', '1')).toBe(true)
    expect(usesFeatureFont('bs', '🙂')).toBe(false)
    expect(usesFeatureFont('snh', '🙂', true)).toBe(false)
  })
})

describe('isChineseDominant', () => {
  it('counts common Han characters instead of the full CJK bucket', () => {
    expect(isChineseDominant('勇攀A')).toBe(true)
    expect(isChineseDominant('勇AAAAA')).toBe(false)
    expect(isChineseDominant('あA')).toBe(false)
    expect(isChineseDominant('가A')).toBe(false)
    expect(isChineseDominant('𠀀A')).toBe(false)
  })
})

describe('createStickerLayout', () => {
  const measureGlyph = (_grapheme: string, fontSize: number) =>
    createMeasurement(fontSize, fontSize)

  it('applies alternating offsets in the expected up/down order', () => {
    const layout = createStickerLayout('勇攀高峰', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    expect(layout.placements.map((placement) => placement.baselineY)).toEqual([-16, 16, -16, 16])
  })

  it('keeps single, double, and four glyph bounds stable', () => {
    const single = createStickerLayout('勇', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })
    const double = createStickerLayout('勇攀', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })
    const four = createStickerLayout('勇攀高峰', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    expect(single.bounds.maxX - single.bounds.minX).toBeGreaterThan(100)
    expect(double.bounds.maxX - double.bounds.minX).toBeGreaterThan(
      single.bounds.maxX - single.bounds.minX,
    )
    expect(four.bounds.maxX - four.bounds.minX).toBeGreaterThan(
      double.bounds.maxX - double.bounds.minX,
    )
  })

  it('keeps every letter of an English word at the same height', () => {
    const layout = createStickerLayout('climb', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    const baselines = layout.placements.map((placement) => placement.baselineY)
    expect(baselines).toEqual([-16, -16, -16, -16, -16])
  })

  it('skews an English word as one continuous slope, not per letter', () => {
    // 施加垂直斜切后，同一单词内字母的锚点应沿倾斜基线单调下滑（整词一致倾斜），
    // 而非每个字母各自以自身锚点归零、显得参差。
    const layout = createStickerLayout('climb', {
      fontSize: 220,
      glyphTransform: { scale: [1, 1], rotationDeg: 0, skewDeg: [0, -8] },
      letterSpacing: 9,
      alternatingOffset: 0,
      measureGlyph,
    })

    const baselines = layout.placements.map((p) => p.baselineY)
    // 首字母锚点在攀登基线上（0），其余逐字母沿斜率累积偏移。
    expect(baselines[0]).toBeCloseTo(0, 5)
    for (let i = 1; i < baselines.length; i += 1) {
      expect(baselines[i]).toBeLessThan(baselines[i - 1])
    }

    // 相邻字母的锚点落差恒定 = tan(斜切) * 步进（advance + letterSpacing），
    // 说明整词是一条直线倾斜，而非逐字母重置。
    const step = 220 + 9
    const expectedDrop = Math.tan((-8 * Math.PI) / 180) * step
    for (let i = 1; i < baselines.length; i += 1) {
      expect(baselines[i] - baselines[i - 1]).toBeCloseTo(expectedDrop, 5)
    }
  })

  it('alternates the height per word for multi-word English text', () => {
    const layout = createStickerLayout('scale new heights', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    const word = layout.placements.map((p) => p.grapheme).join('')
    expect(word).toBe('scalenewheights')

    // "scale" -> 单元 0 (-16)，"new" -> 单元 1 (16)，"heights" -> 单元 2 (-16)
    const scale = layout.placements.slice(0, 5).map((p) => p.baselineY)
    const neu = layout.placements.slice(5, 8).map((p) => p.baselineY)
    const heights = layout.placements.slice(8).map((p) => p.baselineY)
    expect(new Set(scale)).toEqual(new Set([-16]))
    expect(new Set(neu)).toEqual(new Set([16]))
    expect(new Set(heights)).toEqual(new Set([-16]))
  })

  it('keeps English identifiers and technical tokens as one word', () => {
    const layout = createStickerLayout('foo_bar-v2.0/api', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    expect(layout.placements.map((p) => p.grapheme).join('')).toBe('foo_bar-v2.0/api')
    expect(new Set(layout.placements.map((p) => p.baselineY))).toEqual(new Set([-16]))
  })

  it('keeps surrounding spaces in layout bounds without drawing them', () => {
    const compact = createStickerLayout('高', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })
    const spaced = createStickerLayout(' 高 ', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    expect(spaced.placements.map((p) => p.grapheme)).toEqual(['高'])
    expect(spaced.bounds.maxX - spaced.bounds.minX).toBeGreaterThan(
      compact.bounds.maxX - compact.bounds.minX,
    )
  })

  it('produces no height difference when alternatingOffset is zero (flat mode)', () => {
    const layout = createStickerLayout('scale new heights', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 0,
      measureGlyph,
    })

    expect(layout.placements).toHaveLength(15)
    expect(layout.placements.every((p) => p.baselineY === 0)).toBe(true)
  })

  it('keeps CJK characters climbing one per character even next to English', () => {
    const layout = createStickerLayout('高峰 up', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    // 高 -> -16，峰 -> 16，随后 "up" 作为一个词 -> 两个字母都是 -16
    expect(layout.placements.map((p) => p.baselineY)).toEqual([-16, 16, -16, -16])
  })

  it('supports negative letterSpacing without breaking glyph ordering', () => {
    const overlapped = createStickerLayout('勇攀高峰', {
      fontSize: 220,
      letterSpacing: -30,
      alternatingOffset: 16,
      measureGlyph,
    })
    const normal = createStickerLayout('勇攀高峰', {
      fontSize: 220,
      letterSpacing: 9,
      alternatingOffset: 16,
      measureGlyph,
    })

    expect(overlapped.placements[1].x).toBeLessThan(normal.placements[1].x)
    expect(overlapped.bounds.maxX - overlapped.bounds.minX).toBeLessThan(
      normal.bounds.maxX - normal.bounds.minX,
    )
  })

  it('stacks lines split by \\n and grows total height', () => {
    const single = createStickerLayout('勇攀高峰', {
      fontSize: 200,
      letterSpacing: 0,
      alternatingOffset: 0,
      lineHeight: 1.1,
      measureGlyph,
    })
    const wrapped = createStickerLayout('勇攀\n高峰', {
      fontSize: 200,
      letterSpacing: 0,
      alternatingOffset: 0,
      lineHeight: 1.1,
      measureGlyph,
    })

    // 字形数量相同，但换行版本更高更窄。
    expect(wrapped.placements).toHaveLength(single.placements.length)
    expect(wrapped.bounds.maxY - wrapped.bounds.minY).toBeGreaterThan(
      single.bounds.maxY - single.bounds.minY,
    )
    expect(wrapped.bounds.maxX - wrapped.bounds.minX).toBeLessThan(
      single.bounds.maxX - single.bounds.minX,
    )
  })

  it('center-aligns lines of unequal width', () => {
    const layout = createStickerLayout('高峰不常有\n高峰', {
      fontSize: 200,
      letterSpacing: 0,
      alternatingOffset: 0,
      lineHeight: 1.1,
      measureGlyph,
    })

    const longLine = layout.placements.slice(0, 5)
    const shortLine = layout.placements.slice(5)
    const longCenter =
      (Math.min(...longLine.map((p) => p.bounds.minX)) +
        Math.max(...longLine.map((p) => p.bounds.maxX))) /
      2
    const shortCenter =
      (Math.min(...shortLine.map((p) => p.bounds.minX)) +
        Math.max(...shortLine.map((p) => p.bounds.maxX))) /
      2

    expect(Math.abs(longCenter - shortCenter)).toBeLessThan(1)
  })
})

describe('isEmojiGrapheme', () => {
  it('detects pictographic emoji', () => {
    expect(isEmojiGrapheme('😄')).toBe(true)
    expect(isEmojiGrapheme('😡')).toBe(true)
    expect(isEmojiGrapheme('🚀')).toBe(true)
  })

  it('is false for text, CJK, and punctuation', () => {
    expect(isEmojiGrapheme('高')).toBe(false)
    expect(isEmojiGrapheme('a')).toBe(false)
    expect(isEmojiGrapheme('7')).toBe(false)
    expect(isEmojiGrapheme('，')).toBe(false)
  })
})

describe('emoji skew handling', () => {
  const measureGlyph = (_grapheme: string, fontSize: number) =>
    createMeasurement(fontSize, fontSize)

  it('marks emoji upright and text as skewable', () => {
    const layout = createStickerLayout('高😄', {
      fontSize: 220,
      glyphTransform: { scale: [1, 1], rotationDeg: 0, skewDeg: [0, -8] },
      letterSpacing: 9,
      alternatingOffset: 0,
      measureGlyph,
    })

    const [text, emoji] = layout.placements
    expect(text.grapheme).toBe('高')
    expect(text.skew).toBe(true)
    expect(emoji.grapheme).toBe('😄')
    expect(emoji.skew).toBe(false)
  })

  it('keeps emoji bounds unsheared while text bounds shear', () => {
    const layout = createStickerLayout('高😄', {
      fontSize: 220,
      glyphTransform: { scale: [1, 1], rotationDeg: 0, skewDeg: [0, -8] },
      letterSpacing: 9,
      alternatingOffset: 0,
      measureGlyph,
    })

    const neutral = measureSkewedGlyphBounds(createMeasurement(220, 220), 0)
    const neutralHeight = neutral.maxY - neutral.minY
    const text = layout.placements[0]
    const emoji = layout.placements[1]
    const emojiHeight = emoji.bounds.maxY - emoji.bounds.minY
    const textHeight = text.bounds.maxY - text.bounds.minY
    expect(emojiHeight).toBeCloseTo(neutralHeight, 5)
    expect(textHeight).toBeGreaterThan(neutralHeight)
  })
})

describe('classifyGrapheme', () => {
  it('separates CJK, word, space, and other graphemes', () => {
    expect(classifyGrapheme('高')).toBe('cjk')
    expect(classifyGrapheme('あ')).toBe('cjk')
    expect(classifyGrapheme('a')).toBe('word')
    expect(classifyGrapheme('7')).toBe('word')
    expect(classifyGrapheme('é')).toBe('word')
    expect(classifyGrapheme('+')).toBe('word')
    expect(classifyGrapheme('_')).toBe('word')
    expect(classifyGrapheme('/')).toBe('word')
    expect(classifyGrapheme('@')).toBe('word')
    expect(classifyGrapheme('#')).toBe('word')
    expect(classifyGrapheme(' ')).toBe('space')
    expect(classifyGrapheme('，')).toBe('other')
  })
})

describe('findOpaqueBounds', () => {
  it('captures content, shadow, and envelope extents without clipping', () => {
    const alpha = new Uint8ClampedArray(8 * 6)
    alpha[1 * 8 + 1] = 120
    alpha[2 * 8 + 2] = 255
    alpha[4 * 8 + 6] = 80

    expect(findOpaqueBounds(alpha, 8, 6)).toEqual({
      left: 1,
      top: 1,
      right: 6,
      bottom: 4,
    })
  })

  it('returns null for an empty image', () => {
    expect(findOpaqueBounds(new Uint8ClampedArray(16), 4, 4)).toBeNull()
  })
})

describe('normalizeStickerControls', () => {
  it('merges partial JSON with defaults and clamps values', () => {
    const normalized = normalizeStickerControls({
      text: '测试',
      antialiasScale: 9,
      letterSpacing: -999,
      envelope: {
        edgeWidth: 99,
      },
    })

    expect(normalized.text).toBe('测试')
    expect(normalized.antialiasScale).toBe(5)
    expect(normalized.letterSpacing).toBe(-40)
    expect(normalized.envelope.edgeWidth).toBe(12)
    expect(normalized.fontSize).toBe(DEFAULT_STICKER_CONTROLS.fontSize)
  })

})

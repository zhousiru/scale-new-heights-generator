import type { StickerFlavor } from '../config/defaults'
import { CANVAS_FONT_FAMILIES } from '../config/fonts'
import { getContext } from './canvas'
import {
  isCommonHanGrapheme,
  isWesternWordGrapheme,
} from './characters'
import { getFontFaceSet, loadFontFace, withFontLoadTimeout, type FontFaceSource } from './fontFace'
import { createRuntimeCanvas } from './runtime'
import {
  type GlyphMeasurement,
  type GlyphTransform,
} from './types'

/** 字体加载后用于验证字形可用性的采样文本 */
const FONT_SAMPLE_TEXT = '勇攀高峰测试Aa0123456789'
/** 判断整段文本以中文为主的最小汉字占比 */
const CHINESE_DOMINANT_MIN_RATIO = 0.2

export interface StickerFontDescriptor {
  family: string
  weight: string
  file: string
  /**
   * 每种字体在绘制时应用的字形整形参数（见 `drawPlacedGlyphs`）。这些是按字面
   * 手动精调的旋钮，只作用于文字字形（Emoji 保持直立）。所有变换都以每个字形的
   * 基线锚点为中心。垂直斜切（skewDeg[1]）即字面固有的竖向倾斜。
   */
  transform: GlyphTransform
}

/** 贴纸风味到字体文件与字形整形参数的映射 */
const FONT_REGISTRY: Record<StickerFlavor, StickerFontDescriptor> = {
  snh: {
    family: 'DouyinSansBold',
    weight: 'bold',
    file: 'DouyinSansBold.woff2',
    // >>> 勇攀高峰 (抖音美好体) 手动精调区：如需垂直方向挤压等，改这里 <<<
    // scale=[水平, 垂直]；skewDeg=[水平斜切, 垂直斜切]（度）。
    // 垂直斜切 -3.5° 即该字面固有的竖向倾斜。
    transform: {
      scale: [1, 1],
      rotationDeg: 0,
      skewDeg: [0, -3.5],
    },
  },
  bs: {
    family: 'YouSheBiaoTiHei',
    weight: 'bold',
    file: 'YouSheBiaoTiHei.ttf',
    // >>> 字节范 (优设标题黑) 手动精调区：垂直拉高 + 固有水平斜切 <<<
    // scale=[水平, 垂直]；skewDeg=[水平斜切, 垂直斜切]（度）。
    transform: {
      scale: [1, 1.12],
      rotationDeg: 0,
      skewDeg: [8, -6],
    },
  },
}

export function stickerFontDescriptor(
  flavor: StickerFlavor,
): StickerFontDescriptor {
  const descriptor = FONT_REGISTRY[flavor]
  const family = remoteFontFaces.get(flavor)?.family ?? descriptor.family
  return family === descriptor.family ? descriptor : { ...descriptor, family }
}

// 每种字体的字形整形参数（缩放 + 旋转 + 斜切）。返回 FONT_REGISTRY 中手动精调
// 的旋钮。只整形文字字形；Emoji 保持直立以避免描边尖峰。
export function fontGlyphTransform(flavor: StickerFlavor): GlyphTransform {
  return stickerFontDescriptor(flavor).transform
}

// 判断整段文本是否以中文为主。用于 snh：中文比例足够高时，少量英文数字随抖音
// 美好体排版更协调；中文比例低时，西文交给 Inter 以获得更现代的观感。
export function isChineseDominant(text: string): boolean {
  let han = 0
  let latin = 0
  for (const char of text) {
    if (isCommonHanGrapheme(char)) han += 1
    else if (isWesternWordGrapheme(char)) latin += 1
  }
  const textCount = han + latin
  return han > 0 && textCount > 0 && han / textCount >= CHINESE_DOMINANT_MIN_RATIO
}

export function usesFeatureFont(
  flavor: StickerFlavor,
  grapheme?: string,
  chineseDominant = false,
): boolean {
  if (!grapheme) return false
  if (isCommonHanGrapheme(grapheme)) return true
  // 优设标题黑字库含完整中英文与数字，西文与数字全部走特色字体。
  if (flavor === 'bs') {
    return isWesternWordGrapheme(grapheme)
  }
  // 抖音美好体西文字形偏窄：仅在中文占多数时用它承载英文数字，
  // 中文很少时西文落到 Inter。
  if (chineseDominant && isWesternWordGrapheme(grapheme)) {
    return true
  }
  return false
}

export function fontSpec(
  flavor: StickerFlavor,
  fontSize: number,
  grapheme?: string,
  chineseDominant = false,
): string {
  const { family, weight } = stickerFontDescriptor(flavor)
  const families = [
    ...(usesFeatureFont(flavor, grapheme, chineseDominant) ? [`"${family}"`] : []),
    ...CANVAS_FONT_FAMILIES.map((name) => `"${name}"`),
  ].join(', ')
  return `normal ${weight} ${fontSize}px ${families}`
}

const fontLoadPromises = new Map<StickerFlavor, Promise<void>>()
interface FontSubset {
  face: FontFace
  ranges: [number, number][]
}
interface RemoteStickerFont {
  subsets: FontSubset[]
  family: string
}
const remoteFontFaces = new Map<StickerFlavor, RemoteStickerFont>()
const remoteFontDisabled = new Set<StickerFlavor>()
let measurementCanvas: OffscreenCanvas | null = null

/** 浏览器画布与预设菜单共用字体分片；Node 由 runtime 注册本地字体。 */
export function installStickerFontSources(flavor: StickerFlavor, sources?: FontFaceSource[]): void {
  const fonts = getFontFaceSet()
  if (!fonts || !sources?.length || remoteFontFaces.has(flavor) || remoteFontDisabled.has(flavor)) return
  const { family, weight } = FONT_REGISTRY[flavor]
  const faces: FontSubset[] = []
  try {
    for (const { source, unicodeRange } of sources) {
      const face = new FontFace(family, source, { weight, style: 'normal', unicodeRange })
      const ranges: [number, number][] = face.unicodeRange.split(',').map(range => {
        const [start, end = start] = range.trim().replace(/^U\+/i, '').split('-')
        return [parseInt(start.replaceAll('?', '0'), 16), parseInt(end.replaceAll('?', 'f'), 16)]
      })
      faces.push({ face, ranges })
    }
    remoteFontFaces.set(flavor, { subsets: faces, family })
  } catch {
    for (const { face } of faces) fonts.delete(face)
    remoteFontDisabled.add(flavor)
  }
}

export function iconGlyphTransformFrom(baseTransform: GlyphTransform): GlyphTransform {
  return {
    scale: [1, 1],
    rotationDeg: 0,
    skewDeg: [0, baseTransform.skewDeg[1]],
  }
}

export async function ensureStickerFontLoaded(
  flavor: StickerFlavor = 'snh',
  text = FONT_SAMPLE_TEXT,
): Promise<void> {
  const fonts = getFontFaceSet()
  const remote = remoteFontFaces.get(flavor)
  if (fonts && remote) {
    try {
      const selected = new Set<FontFace>()
      for (const char of new Set(text)) {
        const code = char.codePointAt(0)!
        // 后声明的分片优先；直接加载命中的分片，避免 fonts.load() 连同
        // 重叠的大型生僻字分片一起下载。
        const subset = remote.subsets.findLast(({ ranges }) => ranges.some(([start, end]) => code >= start && code <= end))
        if (subset) selected.add(subset.face)
        else if (usesFeatureFont(flavor, char, true)) throw new Error('Character missing from CDN ranges')
      }
      await withFontLoadTimeout(Promise.all([...selected].map(face => face.load())))
      if (remoteFontFaces.get(flavor) === remote) {
        const loaded = remote.subsets.filter(({ face }) => face.status === 'loaded')
        // OffscreenCanvas 会缓存同名字体的分片匹配结果。新增分片后更新族名，
        // 让测量和绘制都重新匹配；族名数量最多等于分片数量，不随渲染次数增长。
        const family = `${FONT_REGISTRY[flavor].family} Subsets ${loaded.length}`
        if (loaded.length > 0 && family !== remote.family) {
          for (const { face } of loaded) fonts.delete(face)
          for (const { face } of loaded) {
            face.family = family
            fonts.add(face)
          }
          remote.family = family
        }
        return
      }
    } catch {
      // 本地整库启用前移除所有远程分片，避免部分下载造成字体混用。
      for (const { face } of remote.subsets) fonts.delete(face)
      remoteFontFaces.delete(flavor)
      remoteFontDisabled.add(flavor)
    }
  }
  let promise = fontLoadPromises.get(flavor)
  if (!promise) {
    const descriptor = FONT_REGISTRY[flavor]
    const spec = `normal ${descriptor.weight} 16px "${descriptor.family}"`

    promise = loadFontFace({
      family: descriptor.family,
      source: `url(${import.meta.env?.BASE_URL ?? ''}${descriptor.file})`,
      style: 'normal',
      weight: descriptor.weight,
      verify: {
        spec,
        text: FONT_SAMPLE_TEXT,
      },
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        fontLoadPromises.delete(flavor)
        throw error
      })
    fontLoadPromises.set(flavor, promise)
  }

  await promise
}

export function measureGlyphWithCanvas(
  grapheme: string,
  fontSize: number,
  flavor: StickerFlavor,
  chineseDominant = false,
): GlyphMeasurement {
  const canvas = measurementCanvas ?? createRuntimeCanvas(1, 1)
  measurementCanvas = canvas
  const context = getContext(canvas)
  context.font = fontSpec(flavor, fontSize, grapheme, chineseDominant)
  context.textBaseline = 'alphabetic'

  const metrics = context.measureText(grapheme)
  const left = metrics.actualBoundingBoxLeft || 0
  const right = metrics.actualBoundingBoxRight || metrics.width
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.82
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.18

  return {
    advanceWidth: metrics.width || right + left || fontSize,
    left,
    right,
    ascent,
    descent,
  }
}

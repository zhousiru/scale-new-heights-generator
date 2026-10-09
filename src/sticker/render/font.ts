import type { StickerFlavor } from '../config/defaults'
import { CANVAS_FONT_FAMILIES } from '../config/fonts'
import { getContext } from '../../shared/render/canvas'
import { isCommonHanGrapheme, isWesternWordGrapheme } from './characters'
import { getFontFaceSet, withFontLoadTimeout, type FontFaceSource } from './fontFace'
import { createRuntimeCanvas } from '../../shared/render/runtime'
import { type GlyphMeasurement, type GlyphTransform } from './types'

/** 字体加载后用于验证字形可用性的采样文本 */
const FONT_SAMPLE_TEXT = '勇攀高峰测试Aa0123456789'

export interface StickerFontDescriptor {
  family: string
  localFamily: string
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
    localFamily: 'DouyinSans-Local',
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
    localFamily: 'YouSheBiaoTiHei-Local',
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

export function stickerFontDescriptor(flavor: StickerFlavor): StickerFontDescriptor {
  const descriptor = FONT_REGISTRY[flavor]
  const localFamily = getFontFaceSet() ? descriptor.localFamily : descriptor.family
  const family = remoteFontFaces.get(flavor)?.family ?? localFamily
  return family === descriptor.family ? descriptor : { ...descriptor, family }
}

// 每种字体的字形整形参数（缩放 + 旋转 + 斜切）。返回 FONT_REGISTRY 中手动精调
// 的旋钮。只整形文字字形；Emoji 保持直立以避免描边尖峰。
export function fontGlyphTransform(flavor: StickerFlavor): GlyphTransform {
  return stickerFontDescriptor(flavor).transform
}

/** 中英文和数字统一使用当前样式的特色字体，其余字符保留回退。 */
export function usesFeatureFont(grapheme?: string): boolean {
  return !!grapheme && (isCommonHanGrapheme(grapheme) || isWesternWordGrapheme(grapheme))
}

export function fontSpec(
  flavor: StickerFlavor,
  fontSize: number,
  grapheme?: string,
  fontWeight?: string,
): string {
  const { family, weight } = stickerFontDescriptor(flavor)
  const families = [
    ...(usesFeatureFont(grapheme) ? [`"${family}"`] : []),
    ...CANVAS_FONT_FAMILIES.map((name) => `"${name}"`),
  ].join(', ')
  return `normal ${fontWeight ?? weight} ${fontSize}px ${families}`
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
  if (!fonts || !sources?.length || remoteFontFaces.has(flavor) || remoteFontDisabled.has(flavor))
    return
  const { family, weight } = FONT_REGISTRY[flavor]
  const faces: FontSubset[] = []
  try {
    for (const { source, unicodeRange } of sources) {
      const face = new FontFace(family, source, { weight, style: 'normal', unicodeRange })
      const ranges: [number, number][] = face.unicodeRange.split(',').map((range) => {
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
        const subset = remote.subsets.findLast(({ ranges }) =>
          ranges.some(([start, end]) => code >= start && code <= end),
        )
        if (subset) selected.add(subset.face)
        else if (usesFeatureFont(char))
          throw new Error('Character missing from CDN ranges')
      }
      await withFontLoadTimeout(Promise.all([...selected].map((face) => face.load())))
      if (remoteFontFaces.get(flavor) === remote) {
        const loaded = remote.subsets.filter(({ face }) => face.status === 'loaded')
        // OffscreenCanvas 会缓存同名字体的分片匹配结果。新增分片后更新族名，
        // 让测量和绘制都重新匹配；族名数量最多等于分片数量，不随渲染次数增长。
        const family = `${FONT_REGISTRY[flavor].family} Render ${loaded.length}`
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
  if (!fonts || typeof FontFace === 'undefined') return

  let promise = fontLoadPromises.get(flavor)
  if (!promise) {
    const descriptor = FONT_REGISTRY[flavor]
    const family = descriptor.localFamily
    const spec = `normal ${descriptor.weight} 16px "${family}"`

    const face = new FontFace(
      family,
      `url(${import.meta.env?.BASE_URL ?? ''}${descriptor.file})`,
      { style: 'normal', weight: descriptor.weight },
    )
    promise = face.load()
      .then(async (loaded) => {
        fonts.add(loaded)
        await fonts.load(spec, FONT_SAMPLE_TEXT)
      })
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
  fontWeight?: string,
): GlyphMeasurement {
  const canvas = measurementCanvas ?? createRuntimeCanvas(1, 1)
  measurementCanvas = canvas
  const context = getContext(canvas)
  context.font = fontSpec(flavor, fontSize, grapheme, fontWeight)
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

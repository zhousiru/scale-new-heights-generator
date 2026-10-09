import { clampNumber, isRecord } from '../../shared/config/normalize'
import {
  ANTIALIAS_SCALE_MAX,
  ANTIALIAS_SCALE_MIN,
  DEFAULT_ANTIALIAS_SCALE,
  DEFAULT_RENDER_SCALE,
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  normalizeAntialiasScale,
  normalizeRenderScale,
} from '../../shared/config/scale'
import {
  DEFAULT_FLASH_STOPS,
  FLASH_STOPS_MAX,
  FLASH_STOPS_MIN,
} from '../../shared/config/hdr'

export interface StickerShadowControls {
  offsetX: number
  offsetY: number
  blur: number
  color: string
  opacity: number
}

export interface StickerEnvelopeControls {
  outlineStrokeWidth: number
  edgeWidth: number
  /** 渐变颜色停靠点，长度 1~3，单色时渲染层会自动补出同色系深色 */
  colors: string[]
  gradientAngle: number
  edgeOpacity: number
}

export interface StickerPaddingControls {
  x: number
  y: number
}

// 渲染风味标识（命名对应参考表情包）。每种风味同时决定展示字面与配色/描边模型：
//   • snh (勇攀高峰)：白色字形置于彩色渐变包体内——抖音美好体字面。
//   • bs  (字节范)：彩色渐变字形带同色系深色轮廓——优设标题黑字面。
export type StickerFlavor = keyof typeof STICKER_DEFAULT_OUTLINE_WIDTH

/** 每种贴纸风味的默认描边厚度 */
export const STICKER_DEFAULT_OUTLINE_WIDTH = {
  snh: 20,
  bs: 14,
}
/** 贴纸渲染风味列表 */
export const STICKER_FLAVORS = Object.keys(STICKER_DEFAULT_OUTLINE_WIDTH) as StickerFlavor[]

/** 字节范图标与文字共用渐变；勇攀高峰分别显示完整渐变 */
export const STICKER_DEFAULT_MERGE_GRADIENT: Record<StickerFlavor, boolean> = {
  snh: false,
  bs: true,
}

// 渲染倍率的单一真源：默认值与合法区间都只在这里定义，
// 渲染层（sticker.ts）与 Node 入口（node.ts）一律 import，禁止各自重写。
export {
  ANTIALIAS_SCALE_MAX,
  ANTIALIAS_SCALE_MIN,
  DEFAULT_ANTIALIAS_SCALE,
  DEFAULT_RENDER_SCALE,
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  normalizeAntialiasScale,
  normalizeRenderScale,
}

export interface StickerControls {
  text: string
  /** 使用哪种渲染风味（字面 + 配色/描边模型） */
  flavor: StickerFlavor
  /** Iconify 图标 id（如 `mdi:rocket`），作为前缀字形渲染；留空则禁用 */
  icon: string
  fontSize: number
  letterSpacing: number
  /** 换行行间距相对 fontSize 的倍率 */
  lineHeight: number
  alternatingOffset: number
  /** 高峰模式：开启时词以错位高度攀登，关闭时对齐平铺 */
  peak: boolean
  /** 文本倾斜：开启时应用字面固有的旋转/斜切；关闭时字形直立（仅保留缩放） */
  tilt: boolean
  /** 图标倾斜：开启时前缀图标跟随字面旋转/斜切 */
  iconTilt: boolean
  /** 合并图标与文字的渐变区域；默认值随风味变化 */
  mergeGradient: boolean
  /** 内部超采样倍率，用于平滑斜线和斜切边缘 */
  antialiasScale: number
  /**
   * CSS font-weight 值，用于 canvas fontSpec。默认 `'bold'`。
   * 对于单 weight 字体（如 DouyinSansBold、YouSheBiaoTiHei），`'bold'` 会触发
   * canvas 引擎的合成加粗；传 `'normal'` 可按字体原生粗细渲染。
   */
  fontWeight: string
  /** 开启后导出 Ultra HDR JPEG gain map；普通路径仍导出 PNG */
  flash: boolean
  /** HDR 增益，单位 EV stops；maxContentBoost = 2^flashStops */
  flashStops: number
  shadow: StickerShadowControls
  envelope: StickerEnvelopeControls
  /** 裁剪结果四周的透明留白，按轴独立设置 */
  padding: StickerPaddingControls
}

/** 贴纸工具默认控件状态 */
export const DEFAULT_STICKER_CONTROLS: StickerControls = {
  text: '高峰不常有',
  flavor: 'snh',
  icon: '',
  fontSize: 220,
  letterSpacing: -8,
  lineHeight: 1,
  alternatingOffset: 16,
  peak: true,
  tilt: true,
  iconTilt: true,
  mergeGradient: STICKER_DEFAULT_MERGE_GRADIENT.snh,
  antialiasScale: DEFAULT_ANTIALIAS_SCALE,
  fontWeight: 'bold',
  flash: false,
  flashStops: DEFAULT_FLASH_STOPS,
  shadow: {
    offsetX: 4,
    offsetY: 6,
    blur: 6,
    color: '#1c3e63',
    // snh 把它当作白字下方的内 multiply 阴影；
    // bs 完全忽略阴影（其立体感来自加深的轮廓）。
    opacity: 0.4,
  },
  envelope: {
    outlineStrokeWidth: STICKER_DEFAULT_OUTLINE_WIDTH.snh,
    edgeWidth: 4,
    colors: ['#08e', '#9cf'],
    gradientAngle: 180,
    edgeOpacity: 0.2,
  },
  padding: {
    x: 4,
    y: 8,
  },
}

// 默认渐变角度：有前缀图标时用 90°（横向，图标与文字并排），无图标时用 180°（纵向，上深下浅）。
export function defaultGradientAngle(icon: string): number {
  return icon.trim().length > 0 ? 90 : 180
}

export function normalizeStickerControls(value: unknown): StickerControls {
  const input = isRecord(value) ? value : {}
  const shadow = isRecord(input.shadow) ? input.shadow : {}
  const envelope = isRecord(input.envelope) ? input.envelope : {}
  const padding = isRecord(input.padding) ? input.padding : {}
  const flavor =
    input.flavor === 'bs' || input.flavor === 'snh'
      ? input.flavor
      : DEFAULT_STICKER_CONTROLS.flavor

  return {
    text:
      typeof input.text === 'string'
        ? input.text
        : DEFAULT_STICKER_CONTROLS.text,
    flavor,
    icon:
      typeof input.icon === 'string'
        ? input.icon
        : DEFAULT_STICKER_CONTROLS.icon,
    fontSize: clampNumber(input.fontSize, 120, 320, DEFAULT_STICKER_CONTROLS.fontSize),
    letterSpacing: clampNumber(
      input.letterSpacing,
      -40,
      40,
      DEFAULT_STICKER_CONTROLS.letterSpacing,
    ),
    lineHeight: clampNumber(
      input.lineHeight,
      0.8,
      2,
      DEFAULT_STICKER_CONTROLS.lineHeight,
    ),
    alternatingOffset: clampNumber(
      input.alternatingOffset,
      0,
      48,
      DEFAULT_STICKER_CONTROLS.alternatingOffset,
    ),
    peak:
      typeof input.peak === 'boolean'
        ? input.peak
        : DEFAULT_STICKER_CONTROLS.peak,
    tilt:
      typeof input.tilt === 'boolean'
        ? input.tilt
        : DEFAULT_STICKER_CONTROLS.tilt,
    iconTilt:
      typeof input.iconTilt === 'boolean'
        ? input.iconTilt
        : DEFAULT_STICKER_CONTROLS.iconTilt,
    mergeGradient:
      typeof input.mergeGradient === 'boolean'
        ? input.mergeGradient
        : STICKER_DEFAULT_MERGE_GRADIENT[flavor],
    antialiasScale: clampNumber(
      input.antialiasScale,
      ANTIALIAS_SCALE_MIN,
      ANTIALIAS_SCALE_MAX,
      DEFAULT_ANTIALIAS_SCALE,
    ),
    fontWeight:
      typeof input.fontWeight === 'string' && input.fontWeight.trim().length > 0
        ? input.fontWeight.trim()
        : DEFAULT_STICKER_CONTROLS.fontWeight,
    flash:
      typeof input.flash === 'boolean'
        ? input.flash
        : DEFAULT_STICKER_CONTROLS.flash,
    flashStops: clampNumber(
      input.flashStops,
      FLASH_STOPS_MIN,
      FLASH_STOPS_MAX,
      DEFAULT_STICKER_CONTROLS.flashStops,
    ),
    shadow: {
      offsetX: clampNumber(
        shadow.offsetX,
        -60,
        60,
        DEFAULT_STICKER_CONTROLS.shadow.offsetX,
      ),
      offsetY: clampNumber(
        shadow.offsetY,
        -60,
        60,
        DEFAULT_STICKER_CONTROLS.shadow.offsetY,
      ),
      blur: clampNumber(shadow.blur, 0, 36, DEFAULT_STICKER_CONTROLS.shadow.blur),
      color: normalizeColor(shadow.color, DEFAULT_STICKER_CONTROLS.shadow.color),
      opacity: clampNumber(
        shadow.opacity,
        0,
        1,
        DEFAULT_STICKER_CONTROLS.shadow.opacity,
      ),
    },
    envelope: {
      outlineStrokeWidth: clampNumber(
        envelope.outlineStrokeWidth,
        0,
        48,
        STICKER_DEFAULT_OUTLINE_WIDTH[flavor],
      ),
      edgeWidth: clampNumber(
        envelope.edgeWidth,
        0,
        12,
        DEFAULT_STICKER_CONTROLS.envelope.edgeWidth,
      ),
      colors: normalizeColors(
        envelope.colors,
        DEFAULT_STICKER_CONTROLS.envelope.colors,
      ),
      gradientAngle: clampNumber(
        envelope.gradientAngle,
        0,
        360,
        DEFAULT_STICKER_CONTROLS.envelope.gradientAngle,
      ),
      edgeOpacity: clampNumber(
        envelope.edgeOpacity,
        0,
        0.4,
        DEFAULT_STICKER_CONTROLS.envelope.edgeOpacity,
      ),
    },
    padding: {
      x: clampNumber(padding.x, 0, 120, DEFAULT_STICKER_CONTROLS.padding.x),
      y: clampNumber(padding.y, 0, 120, DEFAULT_STICKER_CONTROLS.padding.y),
    },
  }
}
function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

// 渐变颜色数组：保留 1~3 个非空字符串停靠点；非法时回退到默认。
function normalizeColors(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const colors = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  )
  if (colors.length === 0) return fallback
  return colors.slice(0, 3)
}

import type { StickerFlavor } from '../config/defaults'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GlyphMeasurement {
  advanceWidth: number
  left: number
  right: number
  ascent: number
  descent: number
}

export interface GlyphPlacement {
  grapheme: string
  x: number
  baselineY: number
  advanceWidth: number
  bounds: Bounds
  /** Emoji 字形直立绘制；文字字形继承排版倾角 */
  skew: boolean
}

// 字形整形变换。所有变换以字形的基线锚点为中心，且仅作用于文字字形。
export interface GlyphTransform {
  /** 缩放 [水平, 垂直]，1 = 原生尺寸，>1 = 放大，优设标题黑需要一点垂直拉伸 */
  scale: [number, number]
  /** 逆时针旋转角度（度），正值 = 逆时针（后仰），负值 = 顺时针 */
  rotationDeg: number
  /**
   * 斜切角度 [水平, 垂直]（度）。
   * 水平斜切：x' = x + tan(水平) * y —— 让字形顶部沿水平方向偏移。
   * 垂直斜切：y' = y + tan(垂直) * x —— 让字形右侧向下压（下坡式竖向倾斜），
   * 即字面固有的竖向倾斜。
   */
  skewDeg: [number, number]
}

/** 不改变字形几何形态的默认变换 */
export const IDENTITY_GLYPH_TRANSFORM: GlyphTransform = {
  scale: [1, 1],
  rotationDeg: 0,
  skewDeg: [0, 0],
}

export interface StickerLayout {
  placements: GlyphPlacement[]
  bounds: Bounds
  letterSpacing: number
  fontSize: number
  flavor: StickerFlavor
  /** CSS font-weight 值，传递到 fontSpec */
  fontWeight: string
  /** 绘制时应用于文字字形的每字体整形参数 */
  glyphTransform: GlyphTransform
}

export interface GradientExtent {
  startProjection: number
  endProjection: number
}

export interface OpaqueBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface IconBox extends Bounds {
  drawWidth: number
  drawHeight: number
}

// 传入渲染的前缀图标。
//   • colored=false：单色图标，只作剪影折进蒙版、随文字配色统一重着色。
//   • colored=true：多色 / duotone 图标，剪影仍折进蒙版拿外描边包围带，
//     但顶层以原生颜色叠加，保留其真实配色。
export interface RenderIcon {
  bitmap: ImageBitmap
  colored: boolean
}

export type { CanvasRenderResult as RenderResult } from '../../shared/render/canvas'

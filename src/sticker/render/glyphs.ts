import type { StickerFlavor } from '../config/defaults'
import { fontSpec, usesFeatureFont } from './font'
import { isEmojiGrapheme } from './layout'
import { dilateCanvasOutwardRound } from './paint'
import { getContext } from './canvas'
import { createRuntimeCanvas } from './runtime'
import type {
  GlyphPlacement,
  GlyphTransform,
  IconBox,
  StickerLayout,
} from './types'

/** Emoji 透明角裁切相对短边的比例 */
const EMOJI_CORNER_CUT_RATIO = 1 / 30
/** Emoji alpha 二值化阈值 */
const EMOJI_ALPHA_THRESHOLD = 16
/** Emoji 膨胀后反走样羽化距离 */
const EMOJI_DILATION_FEATHER = 1

// ---------------------------------------------------------------------------
// Glyph Tile Cache — pre-render each unique glyph once, then blit via drawImage.
// This avoids repeated strokeText/fillText calls (the main web perf bottleneck).
// ---------------------------------------------------------------------------

export interface GlyphTile {
  canvas: OffscreenCanvas
  /** X offset from glyph anchor (placement.x) to tile top-left corner */
  offsetX: number
  /** Y offset from glyph baseline (placement.baselineY) to tile top-left corner */
  offsetY: number
}

/**
 * Render a single glyph to a small canvas with the given stroke width and transform.
 * The transform (scale, rotate, skew) is "baked in" to the tile.
 */
export function renderGlyphTile(
  grapheme: string,
  fontSize: number,
  lineWidth: number,
  flavor: StickerFlavor,
  chineseDominant: boolean,
  glyphTransform: GlyphTransform,
  applySkew: boolean,
): GlyphTile {
  // Measure glyph bounding box (un-transformed)
  const tempCanvas = createRuntimeCanvas(1, 1)
  const tempCtx = getContext(tempCanvas)
  tempCtx.font = fontSpec(flavor, fontSize, grapheme, chineseDominant)
  tempCtx.textBaseline = 'alphabetic'
  const metrics = tempCtx.measureText(grapheme)
  const left = metrics.actualBoundingBoxLeft || 0
  const right = metrics.actualBoundingBoxRight || metrics.width || fontSize
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.82
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.18

  // Compute transformed bounding box to determine tile size
  const { scale, rotationDeg, skewDeg } = glyphTransform
  const [scaleX, scaleY] = scale
  const rotRad = (rotationDeg * Math.PI) / 180
  const hSkewDeg = applySkew && usesFeatureFont(flavor, grapheme, chineseDominant)
    ? skewDeg[0]
    : 0
  const hSkewTan = Math.tan((hSkewDeg * Math.PI) / 180)
  const vSkewTan = Math.tan((skewDeg[1] * Math.PI) / 180)

  // Four corners of glyph bbox relative to anchor (0, 0 = baseline left)
  const corners = [
    { x: -left, y: -ascent },
    { x: right, y: -ascent },
    { x: -left, y: descent },
    { x: right, y: descent },
  ]

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { x, y } of corners) {
    // Apply transform chain: scale → rotate → hSkew → vSkew
    let tx = x * scaleX
    let ty = y * scaleY
    if (rotRad !== 0) {
      const cos = Math.cos(-rotRad), sin = Math.sin(-rotRad)
      const rx = tx * cos - ty * sin
      const ry = tx * sin + ty * cos
      tx = rx; ty = ry
    }
    if (hSkewTan !== 0) tx += hSkewTan * ty
    if (vSkewTan !== 0) ty += vSkewTan * tx
    minX = Math.min(minX, tx)
    minY = Math.min(minY, ty)
    maxX = Math.max(maxX, tx)
    maxY = Math.max(maxY, ty)
  }

  // Add padding for stroke expansion + safety margin
  const strokePad = lineWidth / 2 + 2
  const tileWidth = Math.ceil(maxX - minX + strokePad * 2) + 2
  const tileHeight = Math.ceil(maxY - minY + strokePad * 2) + 2
  const anchorX = -minX + strokePad + 1
  const anchorY = -minY + strokePad + 1

  // Render glyph onto tile canvas
  const canvas = createRuntimeCanvas(tileWidth, tileHeight)
  const ctx = getContext(canvas)
  ctx.translate(anchorX, anchorY)

  if (applySkew) {
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY)
    if (rotRad !== 0) ctx.rotate(-rotRad)
    if (hSkewTan !== 0) ctx.transform(1, 0, hSkewTan, 1, 0, 0)
    if (vSkewTan !== 0) ctx.transform(1, vSkewTan, 0, 1, 0, 0)
  }

  ctx.font = fontSpec(flavor, fontSize, grapheme, chineseDominant)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ffffff'

  if (lineWidth > 0) {
    ctx.lineWidth = lineWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.miterLimit = 2
    ctx.strokeText(grapheme, 0, 0)
  }
  ctx.fillText(grapheme, 0, 0)

  return {
    canvas,
    offsetX: -anchorX,
    offsetY: -anchorY,
  }
}

/**
 * Build a cache of pre-rendered glyph tiles for all unique graphemes in the layout.
 * Returns separate maps for stroke+fill and fill-only tiles.
 * Emoji glyphs get stroke tiles via pixel-level dilation (strokeText doesn't work
 * on bitmap color emoji fonts).
 */
export function buildGlyphTileCache(
  layout: StickerLayout,
  strokeLineWidth: number,
): { strokeTiles: Map<string, GlyphTile>; fillTiles: Map<string, GlyphTile> } {
  const strokeTiles = new Map<string, GlyphTile>()
  const fillTiles = new Map<string, GlyphTile>()
  const { fontSize, flavor, chineseDominant, glyphTransform } = layout

  for (const placement of layout.placements) {
    const { grapheme, skew } = placement

    if (isEmojiGrapheme(grapheme)) {
      // Emoji: stroke tile via fill + pixel dilation; fill tile via plain fill
      if (!strokeTiles.has(grapheme)) {
        strokeTiles.set(grapheme, renderEmojiStrokeTile(
          grapheme, fontSize, strokeLineWidth, flavor, chineseDominant, layout,
        ))
      }
      if (!fillTiles.has(grapheme)) {
        fillTiles.set(grapheme, renderEmojiFillTile(
          grapheme, fontSize, flavor, chineseDominant, layout,
        ))
      }
    } else {
      // Text glyph: stroke tile via strokeText; fill tile via fillText
      if (!strokeTiles.has(grapheme)) {
        strokeTiles.set(grapheme, renderGlyphTile(
          grapheme, fontSize, strokeLineWidth, flavor, chineseDominant, glyphTransform, skew,
        ))
      }
      if (!fillTiles.has(grapheme)) {
        fillTiles.set(grapheme, renderGlyphTile(
          grapheme, fontSize, 0, flavor, chineseDominant, glyphTransform, skew,
        ))
      }
    }
  }

  return { strokeTiles, fillTiles }
}

/**
 * Render an emoji glyph as a white fill tile (no dilation).
 */
function renderEmojiFillTile(
  grapheme: string,
  fontSize: number,
  flavor: StickerFlavor,
  chineseDominant: boolean,
  layout: StickerLayout,
): GlyphTile {
  const placement = layout.placements.find((p) => p.grapheme === grapheme)!
  const bounds = placement.bounds
  const padding = 4
  const tileWidth = Math.ceil(bounds.maxX - bounds.minX + padding * 2)
  const tileHeight = Math.ceil(bounds.maxY - bounds.minY + padding * 2)

  const canvas = createRuntimeCanvas(tileWidth, tileHeight)
  const ctx = getContext(canvas)
  ctx.font = fontSpec(flavor, fontSize, grapheme, chineseDominant)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  // Draw at the correct position within the tile
  const drawX = placement.x - bounds.minX + padding
  const drawY = placement.baselineY - bounds.minY + padding
  ctx.fillText(grapheme, drawX, drawY)
  clearEmojiTileCornerArtifacts(
    ctx,
    padding,
    padding,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  )

  return {
    canvas,
    offsetX: bounds.minX - placement.x - padding,
    offsetY: bounds.minY - placement.baselineY - padding,
  }
}

/**
 * Render an emoji stroke tile by first drawing its fill shape, then dilating
 * outward by strokeLineWidth/2 using rounded distance-field expansion.
 * This works for bitmap emoji fonts where strokeText has no effect.
 */
function renderEmojiStrokeTile(
  grapheme: string,
  fontSize: number,
  strokeLineWidth: number,
  flavor: StickerFlavor,
  chineseDominant: boolean,
  layout: StickerLayout,
): GlyphTile {
  const placement = layout.placements.find((p) => p.grapheme === grapheme)!
  const bounds = placement.bounds
  const dilateRadius = Math.ceil(strokeLineWidth / 2)
  const padding = dilateRadius + 4
  const tileWidth = Math.ceil(bounds.maxX - bounds.minX + padding * 2)
  const tileHeight = Math.ceil(bounds.maxY - bounds.minY + padding * 2)

  const canvas = createRuntimeCanvas(tileWidth, tileHeight)
  const ctx = getContext(canvas)
  ctx.font = fontSpec(flavor, fontSize, grapheme, chineseDominant)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  const drawX = placement.x - bounds.minX + padding
  const drawY = placement.baselineY - bounds.minY + padding
  ctx.fillText(grapheme, drawX, drawY)
  clearEmojiTileCornerArtifacts(
    ctx,
    padding,
    padding,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  )

  dilateCanvasOutwardRound(
    canvas,
    dilateRadius,
    EMOJI_ALPHA_THRESHOLD,
    EMOJI_DILATION_FEATHER,
  )

  return {
    canvas,
    offsetX: bounds.minX - placement.x - padding,
    offsetY: bounds.minY - placement.baselineY - padding,
  }
}

function clearEmojiTileCornerArtifacts(
  context: OffscreenCanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  clearEmojiCornerPair(context, left, top, width, height)
  clearEmojiCornerPair(context, 0, 0, context.canvas.width, context.canvas.height)
}

function clearEmojiCornerPair(
  context: OffscreenCanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const cutSize = Math.max(2, Math.round(Math.min(width, height) * EMOJI_CORNER_CUT_RATIO))
  context.clearRect(left + width - cutSize, top, cutSize, cutSize)
  context.clearRect(left, top + height - cutSize, cutSize, cutSize)
}

/**
 * Draw all glyphs (text + emoji) using pre-rendered tiles (drawImage blit).
 * Much faster than per-glyph strokeText/fillText on web.
 */
export function drawGlyphsFromTiles(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  tiles: Map<string, GlyphTile>,
  originX: number,
  originY: number,
): void {
  for (const placement of layout.placements) {
    const tile = tiles.get(placement.grapheme)
    if (!tile) continue
    context.drawImage(
      tile.canvas,
      originX + placement.x + tile.offsetX,
      originY + placement.baselineY + tile.offsetY,
    )
  }
}

export function resetAndPrepareTextContext(
  context: OffscreenCanvasRenderingContext2D,
  fontSize: number,
  flavor: StickerFlavor,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  configureTextContext(context, fontSize, flavor)
}

export function configureTextContext(
  context: OffscreenCanvasRenderingContext2D,
  fontSize: number,
  flavor: StickerFlavor,
): void {
  context.font = fontSpec(flavor, fontSize)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
}

export function drawFilledGlyphs(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  originX: number,
  originY: number,
  filter?: (placement: GlyphPlacement) => boolean,
): void {
  drawPlacedGlyphs(
    context,
    layout,
    originX,
    originY,
    (current, grapheme) => {
      current.fillText(grapheme, 0, 0)
    },
    filter,
  )
}

// 文字字形（非 Emoji）——它们走单色蒙版着色管线。
export function isTextPlacement(placement: GlyphPlacement): boolean {
  return !isEmojiGrapheme(placement.grapheme)
}

export function drawEmojiGlyphs(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  fontSize: number,
  flavor: StickerFlavor,
  originX: number,
  originY: number,
): void {
  const emojiPlacements = layout.placements.filter(
    (placement) => !isTextPlacement(placement),
  )
  if (emojiPlacements.length === 0) return

  for (const placement of emojiPlacements) {
    // Apple Color Emoji 在右上/左下偶有孤立像素。逐字符隔离绘制后再裁角，
    // 避免一次性绘制全部 emoji 时，某个字符的裁剪矩形擦到相邻字符。
    drawSingleEmojiGlyph(context, layout, placement, fontSize, flavor, originX, originY)
  }
}

// 以 Emoji 原生彩色直接绘制到目标画布（不经蒙版重着色，从而保留其真实配色）。
export function drawColorEmoji(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  fontSize: number,
  flavor: StickerFlavor,
  originX: number,
  originY: number,
): void {
  drawEmojiGlyphs(context, layout, fontSize, flavor, originX, originY)
}

function clearEmojiCornerArtifacts(
  context: OffscreenCanvasRenderingContext2D,
  placement: GlyphPlacement,
  originX: number,
  originY: number,
): void {
  const left = originX + placement.bounds.minX
  const top = originY + placement.bounds.minY
  const width = placement.bounds.maxX - placement.bounds.minX
  const height = placement.bounds.maxY - placement.bounds.minY
  clearEmojiCornerPair(context, left, top, width, height)
}

function drawSingleEmojiGlyph(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  placement: GlyphPlacement,
  fontSize: number,
  flavor: StickerFlavor,
  originX: number,
  originY: number,
): void {
  const left = Math.floor(originX + placement.bounds.minX)
  const top = Math.floor(originY + placement.bounds.minY)
  const right = Math.ceil(originX + placement.bounds.maxX)
  const bottom = Math.ceil(originY + placement.bounds.maxY)
  const emojiCanvas = createRuntimeCanvas(right - left, bottom - top)
  const emojiContext = getContext(emojiCanvas)

  resetAndPrepareTextContext(emojiContext, fontSize, flavor)
  drawPlacedGlyphs(
    emojiContext,
    { ...layout, placements: [placement] },
    originX - left,
    originY - top,
    (current, grapheme) => {
      current.fillText(grapheme, 0, 0)
    },
  )
  clearEmojiCornerArtifacts(emojiContext, placement, originX - left, originY - top)
  context.drawImage(emojiCanvas, left, top)
}

export function drawPlacedGlyphs(
  context: OffscreenCanvasRenderingContext2D,
  layout: StickerLayout,
  originX: number,
  originY: number,
  painter: (context: OffscreenCanvasRenderingContext2D, grapheme: string) => void,
  filter?: (placement: GlyphPlacement) => boolean,
): void {
  const { scale, rotationDeg, skewDeg } = layout.glyphTransform
  const [scaleX, scaleY] = scale
  const rotationRad = (rotationDeg * Math.PI) / 180
  const verticalSkewTangent = Math.tan((skewDeg[1] * Math.PI) / 180)

  for (const placement of layout.placements) {
    if (filter && !filter(placement)) continue
    context.save()
    context.font = fontSpec(
      layout.flavor,
      layout.fontSize,
      placement.grapheme,
      layout.chineseDominant,
    )
    // 锚定在字形的基线左端；下面每一步整形都以此为中心。
    context.translate(originX + placement.x, originY + placement.baselineY)
    if (placement.skew) {
      // 每字体的字形整形（仅文字——Emoji 保持直立）。可在
      // FONT_REGISTRY[...].transform 中精调。
      // 1) 缩放（水平 / 垂直）
      if (scaleX !== 1 || scaleY !== 1) {
        context.scale(scaleX, scaleY)
      }
      // 2) 逆时针旋转（正 rotationDeg = 屏幕坐标下的逆时针）
      if (rotationRad !== 0) {
        context.rotate(-rotationRad)
      }
      const horizontalSkewDeg = usesFeatureFont(
        layout.flavor,
        placement.grapheme,
        layout.chineseDominant,
      )
        ? skewDeg[0]
        : 0
      const horizontalSkewTangent = Math.tan(
        (horizontalSkewDeg * Math.PI) / 180,
      )
      // 3) 水平斜切：x' = x + tan(水平) * y
      if (horizontalSkewTangent !== 0) {
        context.transform(1, 0, horizontalSkewTangent, 1, 0, 0)
      }
      // 4) 垂直斜切：y' = y + tan(垂直) * x（字面固有的竖向倾斜）
      if (verticalSkewTangent !== 0) {
        context.transform(1, verticalSkewTangent, 0, 1, 0, 0)
      }
    }
    painter(context, placement.grapheme)
    context.restore()
  }
}

// 将图标缩放到第一行文字的字高，并放在字形左侧，在该行内垂直居中。
export function computeIconBox(
  iconBitmap: ImageBitmap,
  layout: StickerLayout,
  fontSize: number,
  transform: GlyphTransform,
): IconBox {
  const size = fontSize * 0.86
  const aspect = iconBitmap.width / iconBitmap.height || 1
  const drawWidth = size * aspect
  const gap = fontSize * 0.18

  const first = layout.placements[0]
  const lineTop = first ? first.baselineY - fontSize * 0.72 : -fontSize * 0.72
  const centerY = lineTop + size / 2

  const maxX = layout.bounds.minX - gap
  const minX = maxX - drawWidth
  const box = {
    minX,
    minY: centerY - size / 2,
    maxX,
    maxY: centerY + size / 2,
    drawWidth,
    drawHeight: size,
  }

  return transformIconBox(box, transform)
}

export function drawIcon(
  context: OffscreenCanvasRenderingContext2D,
  iconBitmap: ImageBitmap,
  box: IconBox,
  originX: number,
  originY: number,
  transform: GlyphTransform,
): void {
  context.save()
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const centerX = (box.minX + box.maxX) / 2
  const centerY = (box.minY + box.maxY) / 2
  context.translate(originX + centerX, originY + centerY)
  applyGlyphTransform(context, transform)
  context.drawImage(
    iconBitmap,
    -box.drawWidth / 2,
    -box.drawHeight / 2,
    box.drawWidth,
    box.drawHeight,
  )
  context.restore()
}

function transformIconBox(box: IconBox, transform: GlyphTransform): IconBox {
  const centerX = (box.minX + box.maxX) / 2
  const centerY = (box.minY + box.maxY) / 2
  const corners = [
    [box.minX - centerX, box.minY - centerY],
    [box.maxX - centerX, box.minY - centerY],
    [box.minX - centerX, box.maxY - centerY],
    [box.maxX - centerX, box.maxY - centerY],
  ] as const

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of corners) {
    const point = transformGlyphPoint(x, y, transform)
    minX = Math.min(minX, centerX + point.x)
    minY = Math.min(minY, centerY + point.y)
    maxX = Math.max(maxX, centerX + point.x)
    maxY = Math.max(maxY, centerY + point.y)
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    drawWidth: box.drawWidth,
    drawHeight: box.drawHeight,
  }
}

function applyGlyphTransform(
  context: OffscreenCanvasRenderingContext2D,
  transform: GlyphTransform,
): void {
  const { scale, rotationDeg, skewDeg } = transform
  const [scaleX, scaleY] = scale
  const rotationRad = (rotationDeg * Math.PI) / 180
  const horizontalSkewTangent = Math.tan((skewDeg[0] * Math.PI) / 180)
  const verticalSkewTangent = Math.tan((skewDeg[1] * Math.PI) / 180)

  if (scaleX !== 1 || scaleY !== 1) context.scale(scaleX, scaleY)
  if (rotationRad !== 0) context.rotate(-rotationRad)
  if (horizontalSkewTangent !== 0) {
    context.transform(1, 0, horizontalSkewTangent, 1, 0, 0)
  }
  if (verticalSkewTangent !== 0) {
    context.transform(1, verticalSkewTangent, 0, 1, 0, 0)
  }
}

function transformGlyphPoint(
  x: number,
  y: number,
  transform: GlyphTransform,
): { x: number; y: number } {
  const [scaleX, scaleY] = transform.scale
  let nextX = x * scaleX
  let nextY = y * scaleY

  const rotationRad = (-transform.rotationDeg * Math.PI) / 180
  if (rotationRad !== 0) {
    const cos = Math.cos(rotationRad)
    const sin = Math.sin(rotationRad)
    const rotatedX = nextX * cos - nextY * sin
    const rotatedY = nextX * sin + nextY * cos
    nextX = rotatedX
    nextY = rotatedY
  }

  const horizontalSkewTangent = Math.tan((transform.skewDeg[0] * Math.PI) / 180)
  if (horizontalSkewTangent !== 0) {
    nextX += horizontalSkewTangent * nextY
  }

  const verticalSkewTangent = Math.tan((transform.skewDeg[1] * Math.PI) / 180)
  if (verticalSkewTangent !== 0) {
    nextY += verticalSkewTangent * nextX
  }

  return { x: nextX, y: nextY }
}

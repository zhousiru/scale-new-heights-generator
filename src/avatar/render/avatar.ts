import { getContext, renderResultFromCanvas } from '../../shared/render/canvas'
import {
  normalizeTextRenderInput,
  type TextRenderInput,
} from '../../shared/render/input'
import { createRuntimeCanvas } from '../../shared/render/runtime'
import {
  normalizeAvatarControls,
  type AvatarControls,
} from '../config/defaults'
import { AVATAR_STYLES } from '../config/styles'

interface AvatarLine {
  text: string
  y: number
  width: number
}

interface AvatarTextLayout {
  fontSize: number
  lineHeight: number
  lines: AvatarLine[]
}

interface AvatarPaint {
  gradient: CanvasGradient
  solid: string
}

/** 自动拆行最多尝试的行数 */
const MAX_AUTO_LINES = 5
/** 彩环模式外圈描边相对头像尺寸的比例 */
const OUTLINE_STROKE_RATIO = 0.028
/** 文字布局半径相对头像内容半径的比例 */
const TEXT_RADIUS_RATIO = 0.85
/** 单行文字墨迹半高相对行高的比例 */
const LINE_INK_HALF_HEIGHT_RATIO = 0.34
/** 头像渲染使用的系统字体族 */
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif'

export async function renderAvatar(
  input: TextRenderInput<AvatarControls>,
) {
  const controls = normalizeTextRenderInput(input, normalizeAvatarControls)
  const text = controls.text
  if (!hasAvatarText(text)) {
    throw new Error('Text is required for avatar export.')
  }

  const size = Math.round(controls.size)
  const canvas = createRuntimeCanvas(size, size)
  const context = getContext(canvas)
  const center = size / 2
  const radius = size / 2

  const paint = createAvatarPaint(context, controls, center, radius)
  drawBackground(context, controls, center, radius, size, paint)
  drawText(context, text, controls, center, radius, paint)
  return renderResultFromCanvas(canvas)
}

function drawBackground(
  context: OffscreenCanvasRenderingContext2D,
  controls: AvatarControls,
  center: number,
  radius: number,
  size: number,
  paint: AvatarPaint,
): void {
  context.fillStyle = controls.mode === 'outline' ? '#ffffff' : paint.gradient
  context.fillRect(0, 0, size, size)

  if (controls.mode === 'outline') {
    const lineWidth = Math.max(2, size * OUTLINE_STROKE_RATIO)
    context.lineWidth = lineWidth
    context.strokeStyle = paint.solid
    context.beginPath()
    context.arc(center, center, radius - lineWidth / 2, 0, Math.PI * 2)
    context.stroke()
  }
}

function drawText(
  context: OffscreenCanvasRenderingContext2D,
  text: string,
  controls: AvatarControls,
  center: number,
  radius: number,
  paint: AvatarPaint,
): void {
  const textRadius = Math.min(
    radius,
    radius * TEXT_RADIUS_RATIO * controls.fontScale,
  )
  const layout = fitTextLayout(
    context,
    text,
    textRadius,
    controls.fontWeight,
    controls.lineHeight,
    Math.max(10, radius * 0.12),
  )
  if (!layout) return

  context.save()
  context.translate(center, center)
  context.rotate((controls.rotation * Math.PI) / 180)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = controls.mode === 'outline' ? paint.solid : '#ffffff'
  context.font = fontSpec(layout.fontSize, controls.fontWeight)

  const yOffset = textBlockCenterOffset(context, layout)
  for (const line of layout.lines) {
    context.fillText(line.text, 0, line.y + yOffset)
  }
  context.restore()
}

function createAvatarPaint(
  context: OffscreenCanvasRenderingContext2D,
  controls: AvatarControls,
  center: number,
  radius: number,
): AvatarPaint {
  const angle = ((controls.gradientAngle - 90) * Math.PI) / 180
  const dx = Math.cos(angle) * radius
  const dy = Math.sin(angle) * radius
  const gradient = context.createLinearGradient(
    center - dx,
    center - dy,
    center + dx,
    center + dy,
  )
  const style = AVATAR_STYLES[controls.style]

  style.stops.forEach((stop, index, list) => {
    const position = list.length === 1 ? 0 : index / (list.length - 1)
    gradient.addColorStop(position, stop.srgb)
  })

  return { gradient, solid: style.solid }
}

function fitTextLayout(
  context: OffscreenCanvasRenderingContext2D,
  text: string,
  radius: number,
  fontWeight: number,
  lineHeightRatio: number,
  minFontSize: number,
): AvatarTextLayout | null {
  const manualLines = manualLineTexts(text)
  const graphemes = manualLines ? [] : splitGraphemes(normalizeLineBreaks(text))
  let best: AvatarTextLayout | null = null
  let low = minFontSize
  let high = radius

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const fontSize = (low + high) / 2
    const layout = layoutText(
      context,
      manualLines,
      graphemes,
      fontSize,
      fontWeight,
      radius,
      lineHeightRatio,
    )
    if (layout) {
      best = layout
      low = fontSize
    } else {
      high = fontSize
    }
  }
  return best
}

function layoutText(
  context: OffscreenCanvasRenderingContext2D,
  manualLines: string[] | null,
  graphemes: string[],
  fontSize: number,
  fontWeight: number,
  radius: number,
  lineHeightRatio: number,
): AvatarTextLayout | null {
  context.font = fontSpec(fontSize, fontWeight)
  const lineHeight = fontSize * lineHeightRatio
  if (manualLines) {
    const lines = layoutManualLines(context, manualLines, lineHeight, radius)
    return lines ? { fontSize, lineHeight, lines } : null
  }

  // Share exact substring measurements across all candidate line counts.
  // Keep this cache local to the current font size and render/runtime.
  const measured = new Map<number, { text: string; width: number }>()
  const measureRange = (start: number, end: number) => {
    const key = start * (graphemes.length + 1) + end
    let value = measured.get(key)
    if (!value) {
      const text = graphemes.slice(start, end).join('')
      value = { text, width: context.measureText(text).width }
      measured.set(key, value)
    }
    return value
  }
  const maxLines = Math.min(MAX_AUTO_LINES, graphemes.length)
  let best: AvatarLine[] | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let lineCount = 2; lineCount <= maxLines; lineCount += 1) {
    const lines = chooseAutoLines(measureRange, graphemes.length, lineHeight, lineCount, radius)
    if (!lines) continue

    const score = layoutScore(lines, radius, lineHeight)
    if (score < bestScore) {
      best = lines
      bestScore = score
    }
  }
  return best ? { fontSize, lineHeight, lines: best } : null
}

function manualLineTexts(text: string): string[] | null {
  const hasLineBreak = /\r|\n/.test(text)
  const visibleLength = splitGraphemes(text.replace(/\s+/g, '')).length
  if (!hasLineBreak && visibleLength > 3) return null

  return hasLineBreak
    ? text.split(/\r\n|\r|\n/)
    : [text]
}

function layoutManualLines(
  context: OffscreenCanvasRenderingContext2D,
  lineTexts: string[],
  lineHeight: number,
  radius: number,
): AvatarLine[] | null {
  const lines = lineTexts.map((text, index) => ({
    text,
    y: lineY(index, lineTexts.length, lineHeight),
    width: context.measureText(text).width,
  }))

  return lines.every((line) => line.width <= lineLimit(radius, line.y, lineHeight))
    ? lines
    : null
}

function chooseAutoLines(
  measureRange: (start: number, end: number) => { text: string; width: number },
  graphemeCount: number,
  lineHeight: number,
  lineCount: number,
  radius: number,
): AvatarLine[] | null {
  let best: AvatarLine[] | null = null
  let bestScore = Number.POSITIVE_INFINITY

  function visit(start: number, lineIndex: number, lines: AvatarLine[]): void {
    const remainingLines = lineCount - lineIndex
    const remainingChars = graphemeCount - start
    if (remainingChars < remainingLines) return

    if (remainingLines === 1) {
      const line = createLine(measureRange, start, graphemeCount, lineIndex, lineCount, lineHeight)
      if (line.width > lineLimit(radius, line.y, lineHeight)) return

      const candidate = [...lines, line]
      const score = layoutScore(candidate, radius, lineHeight)
      if (score < bestScore) {
        best = candidate
        bestScore = score
      }
      return
    }

    const y = lineY(lineIndex, lineCount, lineHeight)
    const maxWidth = lineLimit(radius, y, lineHeight)
    const maxEnd = graphemeCount - remainingLines + 1
    for (let end = start + 1; end <= maxEnd; end += 1) {
      const line = createLine(measureRange, start, end, lineIndex, lineCount, lineHeight)
      if (line.width > maxWidth) break
      visit(end, lineIndex + 1, [...lines, line])
    }
  }

  visit(0, 0, [])
  return best
}

function createLine(
  measureRange: (start: number, end: number) => { text: string; width: number },
  start: number,
  end: number,
  lineIndex: number,
  lineCount: number,
  lineHeight: number,
): AvatarLine {
  return {
    ...measureRange(start, end),
    y: lineY(lineIndex, lineCount, lineHeight),
  }
}

function layoutScore(lines: AvatarLine[], radius: number, lineHeight: number): number {
  const fills = lines.map((line) => line.width / lineLimit(radius, line.y, lineHeight))
  const average = fills.reduce((sum, fill) => sum + fill, 0) / fills.length
  const ragged = fills.reduce((sum, fill) => sum + (fill - average) ** 2, 0)
  const lastShort = Math.max(0, average - fills[fills.length - 1])
  return ragged + lastShort * 0.8
}

function lineY(index: number, count: number, lineHeight: number): number {
  return (index - (count - 1) / 2) * lineHeight
}

function chordWidth(radius: number, y: number): number {
  const half = Math.sqrt(Math.max(0, radius * radius - y * y))
  return half * 2
}

function lineLimit(radius: number, y: number, lineHeight: number): number {
  const halfInk = lineHeight * LINE_INK_HALF_HEIGHT_RATIO
  return Math.min(
    chordWidth(radius, y - halfInk),
    chordWidth(radius, y + halfInk),
  )
}

function textBlockCenterOffset(
  context: OffscreenCanvasRenderingContext2D,
  layout: AvatarTextLayout,
): number {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const line of layout.lines) {
    const metrics = context.measureText(line.text)
    const hasInkBounds =
      metrics.actualBoundingBoxAscent > 0 || metrics.actualBoundingBoxDescent > 0
    const lineTop = hasInkBounds
      ? line.y - metrics.actualBoundingBoxAscent
      : line.y - layout.lineHeight / 2
    const lineBottom = hasInkBounds
      ? line.y + metrics.actualBoundingBoxDescent
      : line.y + layout.lineHeight / 2
    top = Math.min(top, lineTop)
    bottom = Math.max(bottom, lineBottom)
  }

  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0
  return -(top + bottom) / 2
}

function fontSpec(fontSize: number, fontWeight: number): string {
  return `${fontWeight} ${fontSize}px ${FONT_FAMILY}`
}

function hasAvatarText(text: string): boolean {
  return text.replace(/\r\n|\r|\n/g, '').length > 0
}

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ')
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), (segment) => segment.segment)
  }
  return Array.from(text)
}

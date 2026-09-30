import type { Bounds } from './types'

const OUTPUT_FONT_SIZE = 72
const OUTPUT_MAX_EDGE = 3072
const OUTPUT_MAX_PIXELS = 512 ** 2

/** At 1x output, start with a fixed 72px em and let the canvas fit the text.
 * Only shrink when the painted bounds exceed the edge or pixel budget.
 * All layout measurements include the same AA factor, which cancels out.
 * Transparent export padding is added separately by the existing crop step.
 */
export function stickerOutputSize(
  bounds: Bounds,
  fontSize: number,
  outlineWidth: number,
  outputScale: number,
  maxOutputEdge?: number,
): { textHeight: number; maxEdge: number } {
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const paintedWidth = width + outlineWidth * 2
  const paintedHeight = height + outlineWidth * 2
  const maxEdge = maxOutputEdge ?? OUTPUT_MAX_EDGE * outputScale
  const maxPixels = OUTPUT_MAX_PIXELS * outputScale ** 2
  const ratio = Math.min(
    OUTPUT_FONT_SIZE * outputScale / Math.max(1, fontSize),
    maxEdge / Math.max(paintedWidth, paintedHeight),
    Math.sqrt(maxPixels / (paintedWidth * paintedHeight)),
  )
  return { textHeight: height * ratio, maxEdge }
}

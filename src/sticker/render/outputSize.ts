import type { Bounds } from './types'

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
  const maxEdge = maxOutputEdge ?? 3072 * outputScale
  const maxPixels = 512 * 512 * outputScale ** 2
  const ratio = Math.min(
    72 * outputScale / Math.max(1, fontSize),
    maxEdge / Math.max(paintedWidth, paintedHeight),
    Math.sqrt(maxPixels / (paintedWidth * paintedHeight)),
  )
  return { textHeight: height * ratio, maxEdge }
}

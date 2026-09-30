import type { Bounds, StickerLayout } from './types'

const COMPACT_RENDER_MAX_PIXELS = 4_000_000
const RASTER_MAX_EDGE = 16_380
const RASTER_MAX_PIXELS = 16_000_000
const SAMPLES_PER_OUTPUT_PIXEL = 2

/** Avoid rasterizing long text at hundreds of times its final pixel count.
 * Target two samples per output pixel, multiplied by the selected AA.
 * Bound large intermediates to 16 megapixels / 16380 pixels per edge.
 * Short text keeps its original raster size. Geometry is scaled, not reflowed.
 */
export function outputAwareRasterScale(
  bounds: Bounds,
  outlineWidth: number,
  outputTextHeight: number,
  maxOutputEdge: number,
  antialiasScale: number,
  workingPadding: number,
): number {
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const outputRatio = Math.min(
    outputTextHeight / height,
    maxOutputEdge / (Math.max(width, height) + outlineWidth * 2),
  )
  const workingWidth = width + workingPadding * 2
  const workingHeight = height + workingPadding * 2
  // Keep compact renders unchanged: lowering their resolution saves little
  // while font hinting and stroke rounding can shift the exported crop.
  if (workingWidth * workingHeight <= COMPACT_RENDER_MAX_PIXELS && Math.max(workingWidth, workingHeight) <= RASTER_MAX_EDGE) {
    return 1
  }
  return Math.min(
    1,
    outputRatio * Math.max(1, antialiasScale) * SAMPLES_PER_OUTPUT_PIXEL,
    RASTER_MAX_EDGE / Math.max(workingWidth, workingHeight),
    Math.sqrt(RASTER_MAX_PIXELS / (workingWidth * workingHeight)),
  )
}

export function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return {
    minX: bounds.minX * scale,
    minY: bounds.minY * scale,
    maxX: bounds.maxX * scale,
    maxY: bounds.maxY * scale,
  }
}

export function scaleLayout(layout: StickerLayout, scale: number): StickerLayout {
  return {
    ...layout,
    fontSize: layout.fontSize * scale,
    letterSpacing: layout.letterSpacing * scale,
    bounds: scaleBounds(layout.bounds, scale),
    placements: layout.placements.map((placement) => ({
      ...placement,
      x: placement.x * scale,
      baselineY: placement.baselineY * scale,
      advanceWidth: placement.advanceWidth * scale,
      bounds: scaleBounds(placement.bounds, scale),
    })),
  }
}

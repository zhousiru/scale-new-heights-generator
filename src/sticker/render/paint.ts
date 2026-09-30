import { computeSquaredDistanceTransform, createAntialiasedAlpha } from './mask'
import { createRuntimeCanvas } from './runtime'
import { getContext } from './canvas'
import type { BinaryMask } from './types'

/**
 * 将二值 mask 转换为白色+alpha 的 canvas（用于后续 destination-in 合成）。
 * 支持传入预计算的 DT 供 createAntialiasedAlpha 复用。
 */
export function maskToCanvas(
  mask: BinaryMask,
  softenRadius = 0,
  precomputedOutsideDT?: Float32Array,
  precomputedInsideDT?: Float32Array,
): OffscreenCanvas {
  const baseCanvas = createRuntimeCanvas(mask.width, mask.height)
  const baseContext = getContext(baseCanvas)
  const imageData = baseContext.createImageData(mask.width, mask.height)
  const alpha =
    softenRadius > 0
      ? createAntialiasedAlpha(mask, softenRadius, precomputedOutsideDT, precomputedInsideDT)
      : mask.data

  for (let index = 0; index < mask.data.length; index += 1) {
    const rgbaIndex = index * 4
    imageData.data[rgbaIndex] = 255
    imageData.data[rgbaIndex + 1] = 255
    imageData.data[rgbaIndex + 2] = 255
    imageData.data[rgbaIndex + 3] = alpha[index]
  }

  baseContext.putImageData(imageData, 0, 0)
  return baseCanvas
}

// ---------------------------------------------------------------------------
// ③ 内存池复用: paintMask 的临时 canvas 可由调用方提供并重复使用，
//    避免每次调用都重新分配同尺寸 canvas。
// ---------------------------------------------------------------------------

/**
 * 创建可复用的 paintMask 临时缓冲区。在多次 paintMask 调用中传入同一个实例，
 * 避免重复创建/销毁同尺寸 OffscreenCanvas。
 */
export function createPaintBuffer(
  width: number,
  height: number,
): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
  const canvas = createRuntimeCanvas(width, height)
  const context = getContext(canvas)
  return { canvas, context }
}

export interface PaintBuffer {
  canvas: OffscreenCanvas
  context: OffscreenCanvasRenderingContext2D
}

/**
 * 通过 mask 合成绘制到目标 canvas。
 * @param buffer 可选复用缓冲区，避免每次调用分配新 canvas。
 */
export function paintMask(
  targetContext: OffscreenCanvasRenderingContext2D,
  maskCanvas: OffscreenCanvas,
  painter: (context: OffscreenCanvasRenderingContext2D) => void,
  opacity = 1,
  compositeOperation: GlobalCompositeOperation = 'source-over',
  buffer?: PaintBuffer,
): void {
  let temporaryContext: OffscreenCanvasRenderingContext2D
  let temporaryCanvas: OffscreenCanvas

  if (buffer) {
    // ③ 复用已有缓冲区：清空后重新绘制
    temporaryCanvas = buffer.canvas
    temporaryContext = buffer.context
    temporaryContext.globalCompositeOperation = 'source-over'
    temporaryContext.globalAlpha = 1
    temporaryContext.setTransform(1, 0, 0, 1, 0, 0)
    temporaryContext.filter = 'none'
    temporaryContext.clearRect(0, 0, temporaryCanvas.width, temporaryCanvas.height)
  } else {
    temporaryCanvas = createRuntimeCanvas(maskCanvas.width, maskCanvas.height)
    temporaryContext = getContext(temporaryCanvas)
  }

  painter(temporaryContext)
  temporaryContext.globalCompositeOperation = 'destination-in'
  temporaryContext.drawImage(maskCanvas, 0, 0)

  targetContext.save()
  targetContext.globalAlpha = opacity
  targetContext.globalCompositeOperation = compositeOperation
  targetContext.drawImage(temporaryCanvas, 0, 0)
  targetContext.restore()
}

// ---------------------------------------------------------------------------
// Canvas-level flood fill for enclosed regions.
// Replaces EDT-based binary mask dilation + fillEnclosedRegions pipeline
// with native Canvas stroke/fill + pixel-level BFS.
// ---------------------------------------------------------------------------

/**
 * Fill enclosed interior regions on a canvas (e.g. inside 口、国、回).
 * Uses edge-seeded flood fill on the alpha channel.
 *
 * Also propagates opacity through the inner antialiased band to prevent
 * a visible "white seam" after gradient compositing. The propagation starts
 * from filled pixels and stops at fully opaque pixels — so it never touches
 * the OUTER antialiased edge.
 */
export function fillEnclosedRegionsCanvas(canvas: OffscreenCanvas): void {
  const { width, height } = canvas
  const ctx = getContext(canvas)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const total = width * height

  // BFS from all 4 canvas edges to mark exterior-reachable background pixels.
  const exterior = new Uint8Array(total)
  const stack = new Int32Array(total)
  let stackTop = -1

  const enqueue = (i: number) => {
    if (data[i * 4 + 3] <= 16 && exterior[i] === 0) {
      exterior[i] = 1
      stack[++stackTop] = i
    }
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }

  while (stackTop >= 0) {
    const i = stack[stackTop--]
    const x = i % width
    const y = (i - x) / width
    if (x > 0) enqueue(i - 1)
    if (x < width - 1) enqueue(i + 1)
    if (y > 0) enqueue(i - width)
    if (y < height - 1) enqueue(i + width)
  }

  // Fill enclosed transparent pixels with opaque white.
  let modified = false
  const filled = new Uint8Array(total)
  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] <= 16 && exterior[i] === 0) {
      const off = i * 4
      data[off] = 255
      data[off + 1] = 255
      data[off + 2] = 255
      data[off + 3] = 255
      filled[i] = 1
      modified = true
    }
  }

  if (modified) {
    // Propagate from filled pixels through the inner AA band (partial alpha,
    // non-exterior) until hitting fully opaque stroke body (α=255).
    stackTop = -1
    for (let i = 0; i < total; i += 1) {
      if (filled[i]) stack[++stackTop] = i
    }
    const promote = (j: number) => {
      const a = data[j * 4 + 3]
      if (a > 16 && a < 255 && filled[j] === 0) {
        data[j * 4 + 3] = 255
        filled[j] = 1
        stack[++stackTop] = j
      }
    }
    while (stackTop >= 0) {
      const i = stack[stackTop--]
      const x = i % width
      const y = (i - x) / width
      if (x > 0) promote(i - 1)
      if (x < width - 1) promote(i + 1)
      if (y > 0) promote(i - width)
      if (y < height - 1) promote(i + width)
    }
    ctx.putImageData(imageData, 0, 0)
  }
}

/**
 * Erode (shrink) an opaque shape inward by `radius` pixels.
 * Two raster passes compute the same four-connected (Manhattan) distance
 * as the original BFS, without a full-canvas queue or visiting background
 * neighbors. Canvas edges are not treated as transparent pixels.
 */
export function erodeCanvasInward(canvas: OffscreenCanvas, radius: number): void {
  if (radius <= 0) return
  const { width, height } = canvas
  const ctx = getContext(canvas)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const total = width * height

  const dist = new Uint16Array(total)
  const intRadius = Math.ceil(radius)
  // Saturate at the original sentinel to preserve behavior for empty/full masks.
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      if (data[i * 4 + 3] <= 16) continue
      const left = x > 0 ? dist[i - 1] : 65535
      const top = y > 0 ? dist[i - width] : 65535
      dist[i] = Math.min(65535, Math.min(left, top) + 1)
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width
    for (let x = width - 1; x >= 0; x--) {
      const i = row + x
      if (dist[i] === 0) continue
      const right = x + 1 < width ? dist[i + 1] : 65535
      const bottom = y + 1 < height ? dist[i + width] : 65535
      dist[i] = Math.min(dist[i], Math.min(right, bottom) + 1)
    }
  }

  let modified = false
  for (let i = 0; i < total; i++) {
    if (dist[i] <= intRadius && data[i * 4 + 3] > 16) {
      data[i * 4 + 3] = 0
      modified = true
    }
  }
  if (modified) {
    ctx.putImageData(imageData, 0, 0)
  }
}

export function dilateCanvasOutwardRound(
  canvas: OffscreenCanvas,
  radius: number,
  alphaThreshold = 16,
  feather = 1,
): void {
  if (radius <= 0) return
  const { width, height } = canvas
  const ctx = getContext(canvas)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const total = width * height
  const mask = new Uint8ClampedArray(total)

  for (let index = 0; index < total; index += 1) {
    mask[index] = data[index * 4 + 3] > alphaThreshold ? 255 : 0
  }

  const distances = computeSquaredDistanceTransform({ width, height, data: mask })
  const featherEnd = radius + feather

  for (let index = 0; index < total; index += 1) {
    const distance = Math.sqrt(distances[index])
    if (distance > featherEnd) continue

    const offset = index * 4
    const alpha = distance <= radius
      ? 255
      : Math.round((featherEnd - distance) / feather * 255)
    data[offset] = 255
    data[offset + 1] = 255
    data[offset + 2] = 255
    data[offset + 3] = Math.max(data[offset + 3], alpha)
  }

  ctx.putImageData(imageData, 0, 0)
}

/**
 * Compute gradient extent from a canvas's alpha channel (replaces gradientExtentFromMask
 * when we no longer have a BinaryMask).
 */
export function gradientExtentFromCanvas(
  canvas: OffscreenCanvas,
  angleDeg: number,
): { startProjection: number; endProjection: number } {
  const { width, height } = canvas
  const ctx = getContext(canvas)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  const angle = ((angleDeg - 90) * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let startProjection = Number.POSITIVE_INFINITY
  let endProjection = Number.NEGATIVE_INFINITY

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      const projection = (x + 0.5) * dx + (y + 0.5) * dy
      startProjection = Math.min(startProjection, projection)
      endProjection = Math.max(endProjection, projection)
    }
  }

  if (!Number.isFinite(startProjection) || endProjection <= startProjection) {
    const fallbackEnd = Math.abs(dx) * Math.max(1, width) + Math.abs(dy) * Math.max(1, height)
    return { startProjection: 0, endProjection: fallbackEnd }
  }

  return { startProjection, endProjection }
}

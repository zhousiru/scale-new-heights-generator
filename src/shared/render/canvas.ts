export type CanvasContextOptions = Pick<CanvasRenderingContext2DSettings, 'willReadFrequently'>

export function getContext(
  canvas: OffscreenCanvas,
  options: CanvasContextOptions = {},
): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', {
    willReadFrequently: options.willReadFrequently ?? true,
  })

  if (!context) {
    throw new Error('2D canvas context is unavailable.')
  }

  return context
}

export type CanvasRenderResult = ReturnType<typeof renderResultFromCanvas>

export function renderResultFromCanvas(canvas: OffscreenCanvas) {
  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    toBlob: () => canvas.convertToBlob({ type: 'image/png' }),
  }
}

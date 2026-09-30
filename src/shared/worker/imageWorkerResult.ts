import type { ImageFileResult } from '../components/ImagePreview'
import type { ImageWorkerResponse } from './imageWorker'

interface WorkerRenderResult {
  canvas: OffscreenCanvas
  width: number
  height: number
  toBlob: () => Promise<Blob>
  toBitmap: () => ImageBitmap
}

const encodedResults = new WeakMap<WorkerRenderResult, Map<string, Promise<ImageFileResult>>>()

export async function postImageWorkerResult(
  id: number,
  type: 'render' | 'export',
  result: WorkerRenderResult,
  flash: boolean,
  flashStops: number,
): Promise<void> {
  if (type === 'render' && !flash) {
    // transferToImageBitmap clears the backing canvas, which would invalidate
    // the cached result. Snapshot it instead and retain the export source.
    const bitmap = await createImageBitmap(result.canvas)
    postMessage({
      type: 'render-result', id, kind: 'bitmap', bitmap,
      width: result.width, height: result.height, mime: 'image/png', extension: 'png',
    } satisfies ImageWorkerResponse, { transfer: [bitmap] })
    return
  }

  let encodings = encodedResults.get(result)
  if (!encodings) {
    encodings = new Map()
    encodedResults.set(result, encodings)
  }
  const key = flash ? `hdr:${flashStops}` : 'png'
  let encoding = encodings.get(key)
  if (!encoding) {
    encoding = Promise.resolve().then(async () => {
      if (!flash) return { blob: await result.toBlob(), mime: 'image/png', extension: 'png' }
      const { encodeUltraHdrJpegFromCanvas, ULTRA_HDR_JPEG_MIME, ULTRA_HDR_JPEG_EXTENSION } = await import('../hdr/ultraHdrJpeg')
      return { blob: encodeUltraHdrJpegFromCanvas(result.canvas, { flashStops }), mime: ULTRA_HDR_JPEG_MIME, extension: ULTRA_HDR_JPEG_EXTENSION }
    })
    encodings.set(key, encoding)
    void encoding.catch(() => encodings!.delete(key))
  }
  const file = await encoding
  postMessage(type === 'render'
    ? { type: 'render-result', id, kind: 'blob', ...file, width: result.width, height: result.height } satisfies ImageWorkerResponse
    : { type: 'export-result', id, ...file } satisfies ImageWorkerResponse)
}


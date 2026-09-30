import type {
  ImageFileResult,
  PreviewResult,
} from '../components/ImagePreview'

export type ImageWorkerResponse =
  | ({ type: 'render-result'; id: number } & PreviewResult)
  | ({ type: 'export-result'; id: number } & ImageFileResult)
  | { type: 'error'; id: number; message: string }

interface PendingRequest {
  id: number
  kind: 'render' | 'export'
  abandoned: boolean
  preparing: boolean
  controller: AbortController
  send: (worker: Worker, id: number, signal: AbortSignal) => void | Promise<void>
  resolve: (value: PreviewResult | ImageFileResult) => void
  reject: (reason: Error) => void
}

export function createImageWorkerClient<Response extends ImageWorkerResponse>(
  createWorker: () => Worker,
) {
  let worker: Worker | null = null
  let nextId = 0
  let active: PendingRequest | null = null
  let queue: PendingRequest[] = []

  const pump = () => {
    if (active || queue.length === 0) return
    // Exports are snapshots of an explicit user action; never cancel them on edits.
    const exportIndex = queue.findIndex((request) => request.kind === 'export')
    const request = queue.splice(Math.max(0, exportIndex), 1)[0]
    active = request
    try {
      if (!worker) {
        worker = createWorker()
        worker.onmessage = (event: MessageEvent<Response>) => {
          const data = event.data
          if (!active || data.id !== active.id) {
            if (data.type === 'render-result' && data.kind === 'bitmap') data.bitmap.close()
            return
          }
          const finished = active
          active = null
          if (finished.abandoned) {
            if (data.type === 'render-result' && data.kind === 'bitmap') data.bitmap.close()
          } else if (data.type === 'error') {
            finished.reject(new Error(data.message))
          } else {
            finished.resolve(responsePayload(data))
          }
          pump()
        }
        const failWorker = () => {
          worker?.terminate()
          worker = null
          active?.controller.abort()
          active?.reject(new Error('Image worker failed'))
          active = null
          for (const queued of queue) queued.reject(new Error('Image worker failed'))
          queue = []
        }
        worker.onerror = failWorker
        worker.onmessageerror = failWorker
      }
      const sending = request.send(worker, request.id, request.controller.signal)
      if (!sending) request.preparing = false
      void Promise.resolve(sending).then(() => {
        request.preparing = false
      }).catch((error: unknown) => {
        if (active !== request) return
        active = null
        request.reject(error instanceof Error ? error : new Error(String(error)))
        pump()
      })
    } catch (error) {
      active = null
      request.reject(error instanceof Error ? error : new Error(String(error)))
      pump()
    }
  }

  const cancel = () => {
    if (active?.kind === 'render' && !active.abandoned) {
      active.abandoned = true
      active.reject(new Error('Cancelled'))
      if (active.preparing) {
        active.controller.abort()
        active = null
      }
    }
    queue = queue.filter((request) => {
      if (request.kind === 'export') return true
      request.reject(new Error('Cancelled'))
      return false
    })
    pump()
  }

  return {
    request<T extends PreviewResult | ImageFileResult>(
      // Async preparation must check signal before posting/transferring assets.
      send: (worker: Worker, id: number, signal: AbortSignal) => void | Promise<void>,
      kind: 'render' | 'export' = 'render',
    ): Promise<T> {
      if (kind === 'render') cancel()
      return new Promise<T>((resolve, reject) => {
        queue.push({
          id: nextId++, kind, send, abandoned: false, preparing: true, controller: new AbortController(),
          resolve: resolve as (value: PreviewResult | ImageFileResult) => void,
          reject,
        })
        pump()
      })
    },
    cancel,
  }
}

/** A single retained result bounds cache memory and also shares in-flight work. */
export function createLatestRenderCache<T>() {
  let latest: { key: string; value: Promise<T> } | undefined
  return (key: string, render: () => Promise<T>): Promise<T> => {
    if (latest?.key === key) return latest.value
    const entry = { key, value: Promise.resolve().then(render) }
    latest = entry
    void entry.value.catch(() => {
      if (latest === entry) latest = undefined
    })
    return entry.value
  }
}

function responsePayload(
  response: Exclude<ImageWorkerResponse, { type: 'error' }>,
): PreviewResult | ImageFileResult {
  if (response.type === 'render-result') return response
  return {
    blob: response.blob,
    mime: response.mime,
    extension: response.extension,
  }
}

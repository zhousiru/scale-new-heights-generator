import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createImageWorkerClient,
  createLatestRenderCache,
  type ImageWorkerResponse,
} from './imageWorker'
import { postImageWorkerResult } from './imageWorkerResult'

function fixture() {
  const worker = {
    onmessage: null as ((event: MessageEvent<ImageWorkerResponse>) => void) | null,
    onerror: null as (() => void) | null,
    terminate: vi.fn<() => void>(),
  }
  const create = vi.fn<() => Worker>(() => worker as unknown as Worker)
  const client = createImageWorkerClient(create)
  const complete = (id: number, type: 'render' | 'export' = 'render') =>
    worker.onmessage?.({
      data: {
        type: type === 'export' ? 'export-result' : 'render-result',
        kind: 'blob',
        width: 1,
        height: 1,
        id,
        blob: new Blob(),
        mime: 'image/png',
        extension: 'png',
      },
    } as MessageEvent<ImageWorkerResponse>)
  return { worker, create, client, complete }
}

afterEach(() => vi.unstubAllGlobals())

describe('image worker scheduling', () => {
  it('reuses the loaded worker across edits', async () => {
    const { client, create, worker, complete } = fixture()
    await client.request('render', (_, id) => complete(id))
    client.cancel()
    await client.request('render', (_, id) => complete(id))
    expect(create).toHaveBeenCalledTimes(1)
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('coalesces edits, finishes active work, and closes stale preview bitmaps', async () => {
    const { client, worker, complete } = fixture()
    const sent: number[] = []
    const send = (_: Worker, id: number) => {
      sent.push(id)
    }
    const first = client.request('render', send).catch((error) => error.message)
    const skipped = client.request('render', send).catch((error) => error.message)
    const latest = client.request('render', send)
    expect(sent).toEqual([0])
    expect(await first).toBe('Cancelled')
    expect(await skipped).toBe('Cancelled')
    const close = vi.fn<() => void>()
    worker.onmessage?.({
      data: { type: 'render-result', id: 0, kind: 'bitmap', bitmap: { close } },
    } as unknown as MessageEvent<ImageWorkerResponse>)
    expect(close).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([0, 2])
    complete(2)
    await latest
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('prioritizes exports and does not cancel them when previews change', async () => {
    const { client, complete } = fixture()
    const sent: number[] = []
    const send = (_: Worker, id: number) => {
      sent.push(id)
    }
    const first = client.request('render', send).catch((error) => error.message)
    const queued = client.request('render', send).catch((error) => error.message)
    const exported = client.request('export', send)
    client.cancel()
    const latest = client.request('render', send)
    complete(0)
    expect(sent).toEqual([0, 2])
    complete(2, 'export')
    await exported
    expect(sent).toEqual([0, 2, 3])
    complete(3)
    await latest
    expect(await first).toBe('Cancelled')
    expect(await queued).toBe('Cancelled')
  })

  it('recovers after synchronous and asynchronous send failures', async () => {
    const { client, complete } = fixture()
    await expect(
      client.request('render', () => {
        throw new Error('sync')
      }),
    ).rejects.toThrow('sync')
    await expect(
      client.request('render', async () => {
        throw new Error('async')
      }),
    ).rejects.toThrow('async')
    await client.request('render', (_, id) => complete(id))
  })

  it('lets a new preview proceed while a cancelled icon is still loading', async () => {
    const { client, complete } = fixture()
    let release!: () => void
    const loading = new Promise<void>((resolve) => {
      release = resolve
    })
    const posted: number[] = []
    let cancelledSignal: AbortSignal | undefined
    const stale = client
      .request('render', async (_, id, signal) => {
        cancelledSignal = signal
        await loading
        if (!signal.aborted) posted.push(id)
      })
      .catch((error) => error.message)
    await client.request('render', (_, id) => {
      posted.push(id)
      complete(id)
    })
    expect(cancelledSignal?.aborted).toBe(true)
    expect(await stale).toBe('Cancelled')
    release()
    await loading
    expect(posted).toEqual([1])
  })

  it('rejects outstanding jobs on worker failure and recreates it on retry', async () => {
    const { client, worker, create, complete } = fixture()
    const active = client.request('export', () => {}).catch((error) => error.message)
    const queued = client.request('export', () => {}).catch((error) => error.message)
    worker.onerror?.()
    expect(await active).toBe('Image worker failed')
    expect(await queued).toBe('Image worker failed')
    await client.request('render', (_, id) => complete(id))
    expect(create).toHaveBeenCalledTimes(2)
  })
})

describe('latest render cache', () => {
  it('shares identical renders but invalidates on parameters changing', async () => {
    const cached = createLatestRenderCache<object>()
    const render = vi.fn<() => Promise<object>>(async () => ({}))
    const first = cached('a', render)
    expect(cached('a', render)).toBe(first)
    await first
    expect(cached('a', render)).toBe(first)
    await cached('b', render)
    await cached('a', render)
    expect(render).toHaveBeenCalledTimes(3)
  })

  it('does not cache failed renders', async () => {
    const cached = createLatestRenderCache<number>()
    await expect(
      cached('a', async () => {
        throw new Error('failed')
      }),
    ).rejects.toThrow('failed')
    expect(await cached('a', async () => 42)).toBe(42)
  })

  it('snapshots previews without consuming the canvas and encodes exports only once', async () => {
    const post = vi.fn<typeof postMessage>()
    const snapshot = vi.fn<typeof createImageBitmap>().mockResolvedValue({} as ImageBitmap)
    vi.stubGlobal('postMessage', post)
    vi.stubGlobal('createImageBitmap', snapshot)
    const result = {
      canvas: {} as OffscreenCanvas,
      width: 100,
      height: 50,
      toBlob: vi.fn<() => Promise<Blob>>(async () => new Blob(['png'])),
    }
    await postImageWorkerResult(0, 'render', result, false, 1)
    await postImageWorkerResult(1, 'export', result, false, 1)
    await postImageWorkerResult(2, 'export', result, false, 1)
    expect(snapshot).toHaveBeenCalledWith(result.canvas)
    expect(result.toBlob).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(3)
  })
})

import { renderSticker } from '../render/sticker'
import type { WorkerRequest, WorkerResponse } from '../config/workerProtocol'
import { ensureInterFontLoaded } from './interFont'
import { installStickerFontSources } from '../render/font'
import { createLatestRenderCache } from '../../shared/worker/imageWorker'
import { postImageWorkerResult } from '../../shared/worker/imageWorkerResult'

const cachedRender = createLatestRenderCache<Awaited<ReturnType<typeof renderSticker>>>()

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, id, controls, icon, fonts, interFont } = e.data

  try {
    installStickerFontSources(controls.flavor, fonts)
    await ensureInterFontLoaded(interFont).catch(() => undefined)
    const key = JSON.stringify([controls, icon ? icon.colored : null])
    const result = await cachedRender(key, () => renderSticker(controls, icon, {
      antialiasScale: controls.antialiasScale,
    }))
    await postImageWorkerResult(
      id,
      type,
      result,
      controls.flash,
      controls.flashStops,
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '渲染失败。'
    const msg: WorkerResponse = { type: 'error', id, message }
    postMessage(msg)
  } finally {
    icon?.bitmap.close()
  }
}

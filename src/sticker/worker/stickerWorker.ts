import type { StickerControls } from '../config/defaults'
import type { WorkerResponse } from '../config/workerProtocol'
import { loadIconBitmap } from '../utils/iconLoader'
import { createImageWorkerClient } from '../../shared/worker/imageWorker'
import { loadInterFontSources, loadStickerFontSources } from './fontStylesheet'
import type {
  ImageFileResult,
  PreviewResult,
} from '../../shared/components/ImagePreview'

export type { PreviewResult }

// duotone 图标注入贴纸主色（首个配色）；其余图标忽略该参数。
function iconPrimaryColor(controls: StickerControls): string {
  return controls.envelope.colors[0] ?? '#ffffff'
}

const client = createImageWorkerClient<WorkerResponse>(() =>
  new Worker(
    new URL('./renderSticker.worker.ts', import.meta.url),
    { type: 'module' },
  ),
)

export function renderStickerPreview(controls: StickerControls): Promise<PreviewResult> {
  return client.request<PreviewResult>(async (worker, id, signal) => {
    const [icon, fonts, interFonts] = await Promise.all([
      loadIconBitmap(controls.icon, iconPrimaryColor(controls)),
      loadStickerFontSources(controls.flavor),
      loadInterFontSources(),
    ])
    if (signal.aborted) {
      icon?.bitmap.close()
      return
    }
    worker.postMessage(
      { type: 'render', id, controls, icon, fonts, interFont: interFonts?.[0] },
      { transfer: icon ? [icon.bitmap] : [] },
    )
  })
}

export function exportStickerBlob(controls: StickerControls): Promise<ImageFileResult> {
  return client.request<ImageFileResult>(async (worker, id, signal) => {
    const [icon, fonts, interFonts] = await Promise.all([
      loadIconBitmap(controls.icon, iconPrimaryColor(controls)),
      loadStickerFontSources(controls.flavor),
      loadInterFontSources(),
    ])
    if (signal.aborted) {
      icon?.bitmap.close()
      return
    }
    worker.postMessage(
      { type: 'export', id, controls, icon, fonts, interFont: interFonts?.[0] },
      { transfer: icon ? [icon.bitmap] : [] },
    )
  }, 'export')
}

export function cancelPendingPreviews(): void {
  client.cancel()
}

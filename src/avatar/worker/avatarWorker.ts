import type { AvatarControls } from '../config/defaults'
import type { AvatarWorkerResponse } from '../config/workerProtocol'
import { createImageWorkerClient } from '../../shared/worker/imageWorker'
import type {
  ImageFileResult,
  PreviewResult,
} from '../../shared/components/ImagePreview'

const client = createImageWorkerClient<AvatarWorkerResponse>(() =>
  new Worker(
    new URL('./renderAvatar.worker.ts', import.meta.url),
    { type: 'module' },
  ),
)

export function renderAvatarPreview(controls: AvatarControls): Promise<PreviewResult> {
  return client.request<PreviewResult>((worker, id) => {
    worker.postMessage({ type: 'render', id, controls })
  })
}

export function exportAvatarBlob(controls: AvatarControls): Promise<ImageFileResult> {
  return client.request<ImageFileResult>((worker, id) => {
    worker.postMessage({ type: 'export', id, controls })
  }, 'export')
}

export function cancelPendingAvatarPreviews(): void {
  client.cancel()
}

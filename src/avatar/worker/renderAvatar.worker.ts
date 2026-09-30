import { renderAvatar } from '../render/avatar'
import type {
  AvatarWorkerRequest,
  AvatarWorkerResponse,
} from '../config/workerProtocol'
import { createLatestRenderCache } from '../../shared/worker/imageWorker'
import { postImageWorkerResult } from '../../shared/worker/imageWorkerResult'

const cachedRender = createLatestRenderCache<Awaited<ReturnType<typeof renderAvatar>>>()

self.onmessage = async (e: MessageEvent<AvatarWorkerRequest>) => {
  const { type, id, controls } = e.data

  try {
    const result = await cachedRender(JSON.stringify(controls), () => renderAvatar(controls))
    await postImageWorkerResult(
      id,
      type,
      result,
      controls.flash,
      controls.flashStops,
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '渲染失败。'
    const msg: AvatarWorkerResponse = { type: 'error', id, message }
    postMessage(msg)
  }
}

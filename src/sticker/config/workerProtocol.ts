import type { StickerControls } from './defaults'
import type { ImageWorkerResponse } from '../../shared/worker/imageWorker'
import type { FontFaceSource } from '../render/fontFace'

export interface WorkerIcon {
  bitmap: ImageBitmap
  colored: boolean
}

export type WorkerRequest =
  | { type: 'render'; id: number; controls: StickerControls; icon: WorkerIcon | null; fonts?: FontFaceSource[]; interFont?: FontFaceSource }
  | { type: 'export'; id: number; controls: StickerControls; icon: WorkerIcon | null; fonts?: FontFaceSource[]; interFont?: FontFaceSource }

export type WorkerResponse = ImageWorkerResponse

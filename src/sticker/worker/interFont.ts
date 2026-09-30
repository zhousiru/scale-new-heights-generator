// Web 端西文字体。渲染跑在 Worker + OffscreenCanvas 里，字体必须显式
// 用 FontFace 加载并 add 进 fonts 集合，canvas 才能命中；单纯引 CSS 无效。
// 优先官方 CDN；失败时使用 inter-ui 的本地 Bold 拉丁子集。
import interBoldUrl from 'inter-ui/web-latin/Inter-Bold-subset.woff2?url'
import type { FontFaceSource } from '../render/fontFace'
import {
  LATIN_FONT_FAMILY,
  LATIN_FONT_FEATURE_SETTINGS,
} from '../config/fonts'
import { FONT_CDN_TIMEOUT_MS, loadFontFace } from '../render/fontFace'

let promise: Promise<void> | null = null

export function ensureInterFontLoaded(remote?: FontFaceSource): Promise<void> {
  const loadLocal = () => loadFontFace({
    family: LATIN_FONT_FAMILY,
    source: `url(${interBoldUrl})`,
    style: 'normal',
    weight: 'bold',
    featureSettings: LATIN_FONT_FEATURE_SETTINGS,
  })
  promise ??= (remote ? loadFontFace({
    family: LATIN_FONT_FAMILY,
    source: remote.source,
    style: 'normal',
    weight: '100 900',
    featureSettings: LATIN_FONT_FEATURE_SETTINGS,
    timeoutMs: FONT_CDN_TIMEOUT_MS,
  }).catch(loadLocal) : loadLocal()).catch((error: unknown) => {
    promise = null
    throw error
  })

  return promise
}

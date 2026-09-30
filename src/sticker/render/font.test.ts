import { afterEach, describe, expect, it, vi } from 'vitest'
import { FONT_CDN_TIMEOUT_MS } from './fontFace'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function fixture(remoteWait?: Promise<void>) {
  vi.resetModules()
  const { ensureStickerFontLoaded, installStickerFontSources } = await import('./font')
  const instances: FakeFontFace[] = []
  class FakeFontFace {
    load = vi.fn<() => Promise<FakeFontFace>>(async () => {
      if (remoteWait && this.source.includes('font.example')) await remoteWait
      return this
    })
    readonly family: string
    readonly source: string
    readonly unicodeRange: string
    constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
      this.family = family
      this.source = source
      this.unicodeRange = descriptors.unicodeRange ?? 'U+0-10FFFF'
      instances.push(this)
    }
  }
  const fonts = { add: vi.fn<(face: FontFace) => void>(), delete: vi.fn<(face: FontFace) => boolean>(), load: vi.fn<(spec: string, text: string) => Promise<FontFace[]>>(async () => []) }
  vi.stubGlobal('FontFace', FakeFontFace)
  vi.stubGlobal('fonts', fonts)
  const sources = [{ source: 'url("https://font.example/subset.woff2")', unicodeRange: 'U+4E00-9FFF' }]
  return { ensureStickerFontLoaded, installStickerFontSources, fonts, instances, sources }
}

describe('browser font sources', () => {
  it('loads the winning overlapping subset, then loads subsets for new text', async () => {
    const { ensureStickerFontLoaded, installStickerFontSources, fonts, instances, sources } = await fixture()
    const overlapping = [...sources, { source: 'url("common.woff2")', unicodeRange: 'U+59CB' }]
    installStickerFontSources('bs', overlapping)
    installStickerFontSources('bs', overlapping)
    await ensureStickerFontLoaded('bs', '始')
    expect(instances[0].load).not.toHaveBeenCalled()
    expect(instances[1].load).toHaveBeenCalledTimes(1)
    await ensureStickerFontLoaded('bs', '新增文案')
    expect(instances).toHaveLength(2)
    expect(instances[0].load).toHaveBeenCalledTimes(1)
    expect(fonts.load).not.toHaveBeenCalled()
  })

  it('removes partial CDN faces and keeps the local fallback after a subset fails', async () => {
    const { ensureStickerFontLoaded, installStickerFontSources, fonts, instances, sources } = await fixture()
    installStickerFontSources('snh', sources)
    instances[0].load.mockRejectedValueOnce(new Error('CDN down'))
    await ensureStickerFontLoaded('snh', '勇攀高峰')
    expect(fonts.delete).toHaveBeenCalledWith(instances[0])
    expect(instances[1].source).toContain('DouyinSansBold.woff2')
    installStickerFontSources('snh', sources)
    await ensureStickerFontLoaded('snh', '新文字')
    expect(instances).toHaveLength(2)
    expect(instances[1].load).toHaveBeenCalledTimes(1)
  })

  it('falls back locally if a CDN subset never finishes loading', async () => {
    const { ensureStickerFontLoaded, installStickerFontSources, fonts, instances, sources } = await fixture()
    vi.useFakeTimers()
    installStickerFontSources('bs', sources)
    instances[0].load.mockImplementationOnce(() => new Promise(() => {}))
    const loading = ensureStickerFontLoaded('bs', '多元兼容')
    await vi.advanceTimersByTimeAsync(FONT_CDN_TIMEOUT_MS)
    await loading
    expect(fonts.delete).toHaveBeenCalledWith(instances[0])
    expect(instances[1].source).toContain('YouSheBiaoTiHei')
  })

  it('does not touch the network or font API in Node', async () => {
    vi.resetModules()
    const { ensureStickerFontLoaded } = await import('./font')
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    await ensureStickerFontLoaded('bs', '离线渲染')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the Inter fallback when the timed-out remote font finishes late', async () => {
    let finishRemote!: () => void
    const remoteWait = new Promise<void>((resolve) => { finishRemote = resolve })
    const { fonts, instances, sources } = await fixture(remoteWait)
    const { ensureInterFontLoaded } = await import('../worker/interFont')
    vi.useFakeTimers()
    const loading = ensureInterFontLoaded(sources[0])
    await vi.advanceTimersByTimeAsync(FONT_CDN_TIMEOUT_MS)
    await loading
    expect(instances[1].source).toContain('Inter-Bold-subset')
    finishRemote()
    await vi.runAllTimersAsync()
    expect(fonts.add).toHaveBeenCalledTimes(1)
    expect(fonts.add).toHaveBeenCalledWith(instances[1])
  })
})

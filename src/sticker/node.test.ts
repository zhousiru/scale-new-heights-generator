import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  StickerGenerator,
  createNapiCanvasRuntime,
  renderStickerToBuffer,
  renderStickerToPngBytes,
  registerStickerFonts,
} from './node'
import { normalizeStickerControls, type StickerFlavor } from './config/defaults'
import { renderSticker } from './render/sticker'
import type { RenderIcon, RenderResult } from './render/types'

function pngSize(buffer: Buffer | Uint8Array) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  )
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

describe('node sticker renderer', () => {
  it('renders PNG bytes without browser APIs', async () => {
    const bytes = await renderStickerToPngBytes({
      text: '高峰不常有',
      icon: '',
      envelope: { colors: ['#1688ff'], gradientAngle: 0 },
    })

    expect(bytes.byteLength).toBeGreaterThan(1024)
    expect(Array.from(bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  })

  it('returns a Buffer for Node bots', async () => {
    const buffer = await renderStickerToBuffer('高峰不常有', { loadIcon: false })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })

  it('图标下载失败时仍生成与关闭图标一致的 PNG', async () => {
    const generator = new StickerGenerator(await createNapiCanvasRuntime())
    const input = { text: '高峰不常有', icon: 'ph:lightbulb' }
    const withoutIcon = await generator.renderBuffer(input, { loadIcon: false })
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('网络不可用'))
    try {
      const buffer = await generator.renderBuffer(input)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(buffer).toEqual(withoutIcon)
    } finally {
      fetch.mockRestore()
    }
  })

  it('keeps output dimensions close when 3x antialiasing is enabled', async () => {
    const base = await renderStickerToBuffer('高峰不常有', {
      loadIcon: false,
      antialiasScale: 1,
    })
    const antialiased = await renderStickerToBuffer('高峰不常有', {
      loadIcon: false,
      antialiasScale: 3,
    })

    const baseSize = pngSize(base)
    const antialiasedSize = pngSize(antialiased)
    expect(Math.abs(antialiasedSize.width - baseSize.width)).toBeLessThan(12)
    expect(Math.abs(antialiasedSize.height - baseSize.height)).toBeLessThan(6)
    expect(antialiased.byteLength).toBeGreaterThan(1024)
  })

  it('clamps antialiasScale to the documented 1-5x range', async () => {
    const at = (antialiasScale: number) => renderStickerToBuffer(
      { text: '高', fontSize: 32, icon: '' },
      { loadIcon: false, antialiasScale },
    )
    const minimum = await at(1)
    const maximum = await at(5)

    // 越界值必须收敛到边界，而不是直接进入渲染管线。
    expect(maximum).not.toEqual(minimum)
    expect(await at(100)).toEqual(maximum)
    expect(await at(-5)).toEqual(minimum)
    expect(await at(0)).toEqual(minimum)
  })

  it('supports an explicit StickerGenerator runtime', async () => {
    const generator = new StickerGenerator(await createNapiCanvasRuntime())
    const input = {
      text: '高峰不常有',
      icon: '',
      padding: { x: 0, y: 0 },
      envelope: { colors: ['#1688ff', '#44b305'], gradientAngle: 45 },
    }
    const buffer = await generator.renderBuffer(input, {
      outputScale: 2, antialiasScale: 1,
    })
    const base = await generator.renderBuffer(input, {
      outputScale: 1, antialiasScale: 1,
    })
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(Math.abs(pngSize(buffer).width - 2 * pngSize(base).width)).toBeLessThanOrEqual(2)
  })
})

it('renders 300 characters on multiple lines without allocating giant canvases', async () => {
  const runtime = await createNapiCanvasRuntime()
  const sizes: number[][] = []
  const generator = new StickerGenerator({
    ...runtime,
    createCanvas: (width, height) => {
      sizes.push([width, height])
      return runtime.createCanvas(width, height)
    },
  })
  const line = '勇攀高峰一起创造更多可能持续学习保持热爱'
  const output = await generator.renderBuffer(Array(15).fill(line).join('\n'), { loadIcon: false })
  expect(pngSize(output).height).toBeGreaterThan(300)
  expect(pngSize(output).height).toBeLessThan(600)
  expect(output.byteLength).toBeGreaterThan(1024)
  expect(Math.max(...sizes.map(([width, height]) => width * height))).toBeLessThan(12_000_000)
})

let icon: RenderIcon

function render(text: string, flavor: StickerFlavor, mergeGradient: boolean, withIcon = true, angle = 90) {
  return renderSticker(normalizeStickerControls({
    text,
    flavor,
    mergeGradient,
    peak: false,
    tilt: false,
    iconTilt: false,
    antialiasScale: 1,
    envelope: { colors: ['#e85621', '#3587ee'], gradientAngle: angle, outlineStrokeWidth: 8 },
    shadow: { opacity: 0 },
  }), withIcon ? icon : null, { outputScale: 3 })
}

function pixels(result: RenderResult) {
  return result.canvas.getContext('2d')!.getImageData(0, 0, result.width, result.height).data
}

// 透明竖列分隔图标与文字，统计第一个连通区域中的不透明彩色像素。
function iconMean(result: RenderResult) {
  const data = pixels(result)
  const sum = [0, 0, 0]
  let started = false
  let count = 0
  for (let x = 0; x < result.width; x++) {
    let occupied = false
    for (let y = 0; y < result.height; y++) {
      const offset = (y * result.width + x) * 4
      occupied ||= data[offset + 3] > 0
      if (data[offset + 3] < 250 || Math.min(...data.slice(offset, offset + 3)) > 240) continue
      for (let channel = 0; channel < 3; channel++) sum[channel] += data[offset + channel]
      count++
    }
    if (started && !occupied) break
    started ||= occupied
  }
  expect(count).toBeGreaterThan(50)
  return sum.map(value => value / count)
}

describe('图标渐变区域', () => {
  beforeAll(async () => {
    const runtime = await createNapiCanvasRuntime()
    new StickerGenerator(runtime)
    await registerStickerFonts({}, runtime)
    const canvas = runtime.createCanvas(32, 32)
    canvas.getContext('2d')!.fillRect(0, 0, 32, 32)
    icon = { bitmap: canvas as unknown as ImageBitmap, colored: false }
  })
  for (const flavor of ['snh', 'bs'] as const) {
    it(`${flavor} 独立渐变的图标配色不随文字长度变化`, async () => {
      for (const angle of [45, 90]) {
        const short = iconMean(await render('高', flavor, false, true, angle))
        const long = iconMean(await render('高高高高高', flavor, false, true, angle))
        expect(Math.max(...short.map((value, channel) => Math.abs(value - long[channel])))).toBeLessThan(3)
      }
    })

    it(`${flavor} 合并渐变的图标随整段文字取色`, async () => {
      const short = iconMean(await render('高', flavor, true))
      const long = iconMean(await render('高高高高高', flavor, true))
      expect(Math.max(...short.map((value, channel) => Math.abs(value - long[channel])))).toBeGreaterThan(10)
    })

    it(`${flavor} 切换区域不会改变轮廓、透明度或无图标的图片`, async () => {
      const independent = await render('高峰', flavor, false)
      const merged = await render('高峰', flavor, true)
      expect([independent.width, independent.height]).toEqual([merged.width, merged.height])
      expect(pixels(independent).filter((_, index) => index % 4 === 3)).toEqual(
        pixels(merged).filter((_, index) => index % 4 === 3),
      )
      expect(pixels(await render('高峰', flavor, false, false))).toEqual(
        pixels(await render('高峰', flavor, true, false)),
      )
    })
  }
})

import { describe, expect, it } from 'vitest'
import {
  StickerGenerator,
  createNapiCanvasRuntime,
  renderStickerToBuffer,
  renderStickerToPngBytes,
} from './node'

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

import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { erodeCanvasInward } from './paint'

// Independent brute-force distance oracle, including threshold and AA pixels.
describe('erodeCanvasInward', () => {
  it('matches four-connected erosion without treating canvas edges as background', () => {
    let seed = 73
    for (const [width, height] of [[1, 1], [1, 13], [17, 1], [9, 11]]) {
      for (const mode of ['opaque', 'transparent', 'mixed']) {
        const source = new Uint8ClampedArray(width * height * 4)
        for (let i = 0; i < width * height; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
          source.set([91, 123, 207, mode === 'opaque' ? 255 : mode === 'transparent' ? 0 : [0, 16, 17, 128, 255][seed % 5]], i * 4)
        }
        for (const radius of [0, 0.1, 1, 2.5, 20]) {
          const canvas = createCanvas(width, height)
          const ctx = canvas.getContext('2d')
          const image = ctx.createImageData(width, height)
          image.data.set(source)
          ctx.putImageData(image, 0, 0)
          const before = ctx.getImageData(0, 0, width, height)
          const expected = new Uint8ClampedArray(before.data)
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4 + 3
              if (before.data[i] <= 16 || radius <= 0) continue
              let distance = Infinity
              for (let yy = 0; yy < height; yy++) {
                for (let xx = 0; xx < width; xx++) {
                  if (before.data[(yy * width + xx) * 4 + 3] <= 16) {
                    distance = Math.min(distance, Math.abs(x - xx) + Math.abs(y - yy))
                  }
                }
              }
              if (distance <= Math.ceil(radius)) expected[i] = 0
            }
          }
          erodeCanvasInward(canvas as unknown as OffscreenCanvas, radius)
          const actual = ctx.getImageData(0, 0, width, height).data
          // Canvas premultiplication discards RGB under zero alpha.
          expect(Array.from(actual).filter((_, i) => i % 4 === 3)).toEqual(
            Array.from(expected).filter((_, i) => i % 4 === 3),
          )
        }
      }
    }
  })
})

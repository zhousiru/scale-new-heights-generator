import { createHash } from 'node:crypto'
import { renderStickerToBuffer } from '../lib/sticker/node.mjs'
import { renderAvatarToBuffer } from '../lib/sticker/avatar/node.mjs'

// Includes PNG encoding; excludes network icons and warms fonts/JIT before timing.
const paragraph = '勇攀高峰一起创造更多可能持续学习保持热爱'
const cases = [
  ['sticker-long-lines', () => renderStickerToBuffer(Array(15).fill(paragraph).join('\n'), { loadIcon: false })],
  ['sticker-long-single', () => renderStickerToBuffer(paragraph.repeat(5), { loadIcon: false })],
  ['sticker-short', () => renderStickerToBuffer('高峰不常有', { loadIcon: false })],
  ['sticker-multiline', () => renderStickerToBuffer('勇攀高峰\n一起创造更多可能\nKeep climbing 2026', { loadIcon: false })],
  ['sticker-3x', () => renderStickerToBuffer('勇攀高峰', { loadIcon: false, antialiasScale: 3 })],
  ['sticker-bs', () => renderStickerToBuffer({ text: '字节范 ByteDance', flavor: 'bs' }, { loadIcon: false })],
  ['avatar-short', () => renderAvatarToBuffer({ text: '前端群', size: 256 })],
  ['avatar-auto-lines', () => renderAvatarToBuffer({ text: '一起创造更多可能勇攀高峰', size: 256 })],
]
const results = []
for (const [name, render] of cases.filter(([name]) => !process.env.BENCH_FILTER || name.includes(process.env.BENCH_FILTER))) {
  for (let i = 0; i < 3; i++) await render()
  const times = []
  let output
  for (let i = 0; i < 9; i++) {
    const start = performance.now()
    output = await render()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  results.push({ name, medianMs: +times[4].toFixed(2), sha256: createHash('sha256').update(output).digest('hex') })
}
console.log(JSON.stringify(results, null, 2))

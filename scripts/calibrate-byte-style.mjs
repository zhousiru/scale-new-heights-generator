import { readFile, writeFile } from 'node:fs/promises'
import { convertRgbToOklab, parseHex } from 'culori/fn'

// 正则化强度在参考色板拟合时选定；抑制颜色和邻色项过拟合，不惩罚截距。
const RIDGE_PENALTY = 0.02
const COEFFICIENT_DECIMALS = 6
const FEATURE_COUNT = 7
const target = new URL('../src/sticker/config/byteStyleCalibration.ts', import.meta.url)
const reference = JSON.parse(await readFile(new URL('./fixtures/byte-style-palettes.json', import.meta.url), 'utf8'))
const toOklab = hex => {
  const { l, a, b } = convertRgbToOklab(parseHex(hex))
  return [l, a, b]
}
const samples = Object.values(reference).flatMap(({ foreground, outline }) => {
  const front = foreground.map(toOklab), edge = outline.map(toOklab)
  const midpoints = front.map((color, stop) => color.map((value, axis) => (value + edge[stop][axis]) / 2))
  return midpoints.map((color, stop) => ({
    features: [1, ...color, ...midpoints[1 - stop].map((value, axis) => value - color[axis])],
    split: front[stop].map((value, axis) => (value - edge[stop][axis]) / 2),
  }))
})

// 用部分选主元消元求解小型正规方程。只用于离线校准，不进入渲染产物。
function solve(matrix, values) {
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < FEATURE_COUNT; column++) {
    let pivot = column
    for (let row = column + 1; row < FEATURE_COUNT; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    if (!divisor) throw new Error('校准矩阵不可逆')
    for (let entry = column; entry <= FEATURE_COUNT; entry++) augmented[column][entry] /= divisor
    for (let row = 0; row < FEATURE_COUNT; row++) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let entry = column; entry <= FEATURE_COUNT; entry++) augmented[row][entry] -= factor * augmented[column][entry]
    }
  }
  return augmented.map(row => row[FEATURE_COUNT])
}

const matrix = Array.from({ length: FEATURE_COUNT }, () => Array(FEATURE_COUNT).fill(0))
const values = Array.from({ length: 3 }, () => Array(FEATURE_COUNT).fill(0))
for (const { features, split } of samples) {
  for (let row = 0; row < FEATURE_COUNT; row++) {
    for (let column = 0; column < FEATURE_COUNT; column++) matrix[row][column] += features[row] * features[column]
    for (let axis = 0; axis < 3; axis++) values[axis][row] += features[row] * split[axis]
  }
}
for (let feature = 1; feature < FEATURE_COUNT; feature++) matrix[feature][feature] += RIDGE_PENALTY
const coefficients = values.map(axis => solve(matrix, axis))
const rows = coefficients.map(row => `    [${row.map(value => Number(value.toFixed(COEFFICIENT_DECIMALS))).join(', ')}],`).join('\n')
const output = `// 由 node scripts/calibrate-byte-style.mjs 生成。
// 测量数据：scripts/fixtures/byte-style-palettes.json，仅保存 RGB 色值。
// 各行预测 [ΔL, Δa, Δb]；各列依次对应
// [截距, L, a, b, 邻色ΔL, 邻色Δa, 邻色Δb]。
export const BYTE_STYLE_CALIBRATION = {
  split: [
${rows}
  ],
  // 输入不在参考色板内时，也为字面与描边保留可辨认的明度差。
  minLightnessSplit: 0.10,
  maxLightnessSplit: 0.24,
  // 输入接近中性灰时，将色度调整逐渐减到零。
  neutralChroma: 0.03,
} as const
`
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('校准结果与配置不一致，请运行 node scripts/calibrate-byte-style.mjs')
} else {
  await writeFile(target, output)
}
console.log(`已校准 ${samples.length} 个颜色停靠点；正则化强度 ${RIDGE_PENALTY}，系数保留 ${COEFFICIENT_DECIMALS} 位小数`)

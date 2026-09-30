import { readFile, writeFile } from 'node:fs/promises'
import { convertRgbToOklab, parseHex } from 'culori/fn'

// Chosen by leave-one-preset-out validation over the measured palettes.
// Penalize color/neighbor weights, keeping the intercept unpenalized.
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

// Solve the small normal equation with partial pivoting. This is a build-time
// fit, never shipped to the renderer, and needs no numerical-library dependency.
function solve(matrix, values) {
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < FEATURE_COUNT; column++) {
    let pivot = column
    for (let row = column + 1; row < FEATURE_COUNT; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    if (!divisor) throw new Error('Singular calibration matrix')
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
const output = `// Generated coefficients: node scripts/calibrate-byte-style.mjs
// Measurements: scripts/fixtures/byte-style-palettes.json (RGB colors only).
// Rows predict [ΔL, Δa, Δb]; columns are
// [intercept, L, a, b, neighbor.ΔL, neighbor.Δa, neighbor.Δb].
export const BYTE_STYLE_CALIBRATION = {
  split: [
${rows}
  ],
  // Keep a readable text/outline gap even outside the measured palettes.
  minLightnessSplit: 0.10,
  maxLightnessSplit: 0.24,
  // Fade chromatic adjustments to zero as input approaches neutral gray.
  neutralChroma: 0.03,
} as const
`
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Calibration differs; run node scripts/calibrate-byte-style.mjs')
} else {
  await writeFile(target, output)
}
console.log(`Calibrated ${samples.length} stops; ridge=${RIDGE_PENALTY}, ${COEFFICIENT_DECIMALS} decimal coefficients`)

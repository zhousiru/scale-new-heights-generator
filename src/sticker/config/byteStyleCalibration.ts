// 由 node scripts/calibrate-byte-style.mjs 生成。
// 测量数据：scripts/fixtures/byte-style-palettes.json，仅保存 RGB 色值。
// 各行预测 [ΔL, Δa, Δb]；各列依次对应
// [截距, L, a, b, 邻色ΔL, 邻色Δa, 邻色Δb]。
export const BYTE_STYLE_CALIBRATION = {
  split: [
    [0.257432, -0.154123, -0.171574, -0.040156, 0.048742, -0.030464, -0.054308],
    [0.005749, -0.033239, -0.164178, -0.034416, 0.157135, -0.039628, -0.035442],
    [0.042756, -0.058246, 0.055164, -0.085112, -0.129385, 0.062993, 0.051851],
  ],
  // 输入不在参考色板内时，也为字面与描边保留可辨认的明度差。
  minLightnessSplit: 0.10,
  maxLightnessSplit: 0.24,
  // 输入接近中性灰时，将色度调整逐渐减到零。
  neutralChroma: 0.03,
} as const

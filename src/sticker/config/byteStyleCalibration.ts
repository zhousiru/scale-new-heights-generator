// Generated coefficients: node scripts/calibrate-byte-style.mjs
// Measurements: scripts/fixtures/byte-style-palettes.json (RGB colors only).
// Rows predict [ΔL, Δa, Δb]; columns are
// [intercept, L, a, b, neighbor.ΔL, neighbor.Δa, neighbor.Δb].
export const BYTE_STYLE_CALIBRATION = {
  split: [
    [0.257432, -0.154123, -0.171574, -0.040156, 0.048742, -0.030464, -0.054308],
    [0.005749, -0.033239, -0.164178, -0.034416, 0.157135, -0.039628, -0.035442],
    [0.042756, -0.058246, 0.055164, -0.085112, -0.129385, 0.062993, 0.051851],
  ],
  // Keep a readable text/outline gap even outside the measured palettes.
  minLightnessSplit: 0.10,
  maxLightnessSplit: 0.24,
  // Fade chromatic adjustments to zero as input approaches neutral gray.
  neutralChroma: 0.03,
} as const

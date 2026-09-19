import type { Matrix3 } from './geometry.model'

/**
 * True when `m` is a plausible page-to-page transform rather than numerical debris.
 *
 * RANSAC on a minimal sample of near-collinear points loves to return a
 * matrix that folds the page in half. Cheaper to reject it here than to
 * discover it in the output.
 */
export function isPlausible (m: Matrix3, maxScaleRatio = 8): boolean {
  if (m.some(v => !Number.isFinite(v))) return false

  const [a, b, , d, e] = m
  const det = a * e - b * d
  if (Math.abs(det) <= 1e-9) return false
  // A mirrored page is never a scan of the same page.
  if (det < 0) return false

  const sx = Math.hypot(a, d)
  if (sx < 1 / maxScaleRatio || sx > maxScaleRatio) return false

  const sy = Math.hypot(b, e)

  return !(sy < 1 / maxScaleRatio || sy > maxScaleRatio)
}

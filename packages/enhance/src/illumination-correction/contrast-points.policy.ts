import type { GrayImage } from '@scanmate/ink'

/**
 * Where to clamp to black and to white, read from the page itself.
 *
 * Every pixel is a ratio to its local background: paper sits near 1, ink well
 * below. A histogram of those ratios has two populations, and fixed clamp points
 * suit only the average page. Instead the black point sits just above where the
 * darkest 1% fall and the white point just below where the brightest 1% start,
 * so a faint page gets a hard stretch and a crisp one a gentle one. Both are
 * kept within bounds that no real page needs to leave: black at most 0.4, white
 * between 0.7 and 1.1.
 */

export interface ContrastPoints {
  whitePoint: number
  blackPoint: number
}

const BINS = 256
const MAX_RATIO = 1.5
const BLACK_PERCENTILE = 0.01
const WHITE_PERCENTILE = 0.99

export function estimateContrastPoints (gray: GrayImage, background: GrayImage): ContrastPoints {
  const histogram = new Float64Array(BINS)
  for (let p = 0; p < gray.data.length; p++) {
    const ratio = gray.data[p] / Math.max(background.data[p], 1e-3)
    histogram[Math.min(BINS - 1, Math.max(0, Math.round((ratio / MAX_RATIO) * (BINS - 1))))]++
  }

  const total = gray.data.length

  return {
    blackPoint: clamp((percentileBin(histogram, total, BLACK_PERCENTILE) / (BINS - 1)) * MAX_RATIO, 0, 0.4),
    whitePoint: clamp((percentileBin(histogram, total, WHITE_PERCENTILE) / (BINS - 1)) * MAX_RATIO, 0.7, 1.1),
  }
}

/** Fixed points pass through; `'auto'` ones come from {@link estimateContrastPoints}, computed only if needed. */
export function resolveContrastPoints (
  whitePoint: number | 'auto',
  blackPoint: number | 'auto',
  gray: GrayImage,
  background: GrayImage,
): ContrastPoints {
  if (whitePoint !== 'auto' && blackPoint !== 'auto') return { whitePoint, blackPoint }

  const auto = estimateContrastPoints(gray, background)

  return {
    whitePoint: whitePoint === 'auto' ? auto.whitePoint : whitePoint,
    blackPoint: blackPoint === 'auto' ? auto.blackPoint : blackPoint,
  }
}

/** The bin at which the cumulative count first reaches `percentile` of `total`. */
function percentileBin (histogram: Float64Array, total: number, percentile: number): number {
  const target = total * percentile
  let cumulative = 0
  for (const [bin, count] of histogram.entries()) {
    cumulative += count
    if (cumulative >= target) return bin
  }

  return histogram.length - 1
}

function clamp (value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

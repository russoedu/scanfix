import type { ContentExtent, GrayImage, Matrix3 } from '@scanmate/ink'
import { contentExtent, correlation, downscaleGray, estimateSkew, isPlausible, multiply, rebase, similarity, translation, warpGray } from '@scanmate/ink'
import { phaseCorrelate } from '../phase-correlation'

/**
 * A first, cheap answer good enough to make the expensive one possible.
 *
 * Descriptor matching has a blind spot: BRIEF compares fixed pixel offsets, so
 * a scan at 300 dpi and a page rendered at 150 describe the same corner with
 * two unrelated bit strings. Something has to establish roughly how big the
 * scan is before the matcher runs, and nothing in the file says.
 *
 * So guess, several ways, and let the pixels judge:
 *
 * - **frame** — assume the scan is the whole page, so the frames correspond.
 * - **content** — assume the *printing* corresponds. Robust to a scan with
 *   wider margins, which the frame guess gets badly wrong.
 * - **deskew** — measure each page's own skew, and match the printing in the
 *   frame where each sits straight. This is the one that usually wins.
 *
 * Each gets a phase-correlation nudge, then all of them are warped and scored
 * on ink correlation. Guessing several times and measuring is far more robust
 * than one clever guess, and at this resolution each attempt costs very little.
 */

export interface CoarseOptions {
  /** Longest side of the images the search runs on. */
  workingSize?:   number
  /** Largest per-page skew considered, in degrees. */
  maxSkewDeg?:    number
  /** Largest scale ratio between the two images that will be entertained. */
  maxScaleRatio?: number
}

export interface CoarseResult {
  /** Maps full-resolution original coordinates to full-resolution scan coordinates. */
  matrix:   Matrix3
  /** Ink correlation achieved by this transform, in `[-1, 1]`. */
  score:    number
  /** Which guess won, for diagnostics. */
  strategy: string
  skew:     { original: number, scanned: number }
}

interface Candidate {
  strategy: string
  matrix:   Matrix3
}

export function estimateCoarse (
  originalInk: GrayImage,
  scannedInk: GrayImage,
  options: CoarseOptions = {},
): CoarseResult {
  const { workingSize = 512, maxSkewDeg = 12, maxScaleRatio = 6 } = options

  const original = downscaleGray(originalInk, workingSize)
  const scanned = downscaleGray(scannedInk, workingSize)

  const originalSkew = estimateSkew(original.image, { maxAngleDeg: maxSkewDeg })
  const scannedSkew = estimateSkew(scanned.image, { maxAngleDeg: maxSkewDeg })

  const originalFlat = contentExtent(original.image, 0)
  const scannedFlat = contentExtent(scanned.image, 0)
  const originalTilted = contentExtent(original.image, originalSkew)
  const scannedTilted = contentExtent(scanned.image, scannedSkew)

  const candidates: Candidate[] = []

  const frameScale = geometricMean(
    scanned.image.width / original.image.width,
    scanned.image.height / original.image.height,
  )
  push(candidates, 'frame', similarity(
    frameScale,
    0,
    { x: original.image.width / 2, y: original.image.height / 2 },
    { x: scanned.image.width / 2, y: scanned.image.height / 2 },
  ), maxScaleRatio)

  if (originalFlat.density > 0 && scannedFlat.density > 0)
    push(candidates, 'content', fromExtents(originalFlat, scannedFlat, 0), maxScaleRatio)

  if (originalTilted.density > 0 && scannedTilted.density > 0)
    push(
      candidates,
      'deskew',
      fromExtents(originalTilted, scannedTilted, scannedSkew - originalSkew),
      maxScaleRatio,
    )

  let bestMatrix: Matrix3 = similarity(
    Number.isFinite(frameScale) ? frameScale : 1,
    0,
    { x: original.image.width / 2, y: original.image.height / 2 },
    { x: scanned.image.width / 2, y: scanned.image.height / 2 },
  )
  let bestScore = -Infinity
  let bestStrategy = 'fallback'

  for (const candidate of candidates) {
    for (const variant of withTranslationPolish(candidate, original.image, scanned.image)) {
      const warped = warpGray(scanned.image, variant.matrix, original.image.width, original.image.height, 0)
      const score = correlation(original.image, warped)
      if (score > bestScore) {
        bestMatrix = variant.matrix
        bestScore = score
        bestStrategy = variant.strategy
      }
    }
  }

  return {
    // Measured on two independently shrunk copies; hand back full-resolution pixels.
    matrix:   rebase(bestMatrix, original.scale, scanned.scale),
    score:    bestScore === -Infinity ? 0 : bestScore,
    strategy: bestStrategy,
    skew:     { original: originalSkew, scanned: scannedSkew },
  }
}

/** The coarse matrix, plus a copy nudged by whatever phase correlation says is left over. */
function withTranslationPolish (
  candidate: Candidate,
  original: GrayImage,
  scanned: GrayImage,
): Candidate[] {
  const warped = warpGray(scanned, candidate.matrix, original.width, original.height, 0)

  let shift: { dx: number, dy: number, peak: number }
  try {
    shift = phaseCorrelate(original, warped)
  } catch {
    return [candidate]
  }

  if (!Number.isFinite(shift.dx) || !Number.isFinite(shift.dy)) return [candidate]
  if (Math.abs(shift.dx) < 0.25 && Math.abs(shift.dy) < 0.25) return [candidate]

  // `warped` sits in the original's frame, so a residual shift of d means the
  // original at p matches the warp at p + d: sample d further along.
  return [
    candidate,
    {
      strategy: `${candidate.strategy}+phase`,
      matrix:   multiply(candidate.matrix, translation(shift.dx, shift.dy)),
    },
  ]
}

function fromExtents (original: ContentExtent, scanned: ContentExtent, angle: number): Matrix3 {
  const scale = geometricMean(scanned.width / original.width, scanned.height / original.height)

  return similarity(scale, angle, original.center, scanned.center)
}

function push (into: Candidate[], strategy: string, matrix: Matrix3, maxScaleRatio: number): void {
  if (isPlausible(matrix, maxScaleRatio)) into.push({ strategy, matrix })
}

/**
 * Geometric rather than arithmetic mean of the two axis ratios.
 *
 * The quantity is a ratio, and the mean of a ratio and its reciprocal should be
 * one. Arithmetic mean says 1.25.
 */
function geometricMean (a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b) || a <= 0 || b <= 0) return NaN

  return Math.sqrt(a * b)
}

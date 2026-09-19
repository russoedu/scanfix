import { binarize, correlation, downscaleGray, intersectionOverUnion, rebase, warpGray } from '@scanmate/ink'
import type { GrayImage, Matrix3 } from '@scanmate/ink'

/**
 * How well a proposed transform actually lines the two pages up.
 *
 * Every candidate in a model sweep is judged the same way, on the same two
 * downscaled ink maps, so the downscales - and the original's mask - are done
 * once when the referee is created rather than once per candidate. What is left
 * per call is one warp and two scores.
 */

export interface Agreement {
  /** Ink correlation after warping, in `[-1, 1]`. */
  correlation: number
  /** Ink mask overlap after warping, in `[0, 1]`. */
  iou:         number
}

/** Longest side the referee judges at. Enough to see a stroke line up; cheap enough to call per model. */
const REFEREE_SIZE = 800

export function createReferee (
  originalInk: GrayImage,
  scannedInk: GrayImage,
  workingSize: number,
): (matrix: Matrix3) => Agreement {
  const size = Math.min(workingSize, REFEREE_SIZE)
  const original = downscaleGray(originalInk, size)
  const scanned = downscaleGray(scannedInk, size)
  const originalMask = binarize(original.image)

  return (matrix: Matrix3): Agreement => {
    const work = rebase(matrix, 1 / original.scale, 1 / scanned.scale)
    const warped = warpGray(scanned.image, work, original.image.width, original.image.height, 0)

    return {
      correlation: correlation(original.image, warped),
      iou:         intersectionOverUnion(originalMask, binarize(warped)),
    }
  }
}

/** A correlation as a confidence: clamped to `[0, 1]`, because anti-correlated ink is no alignment at all. */
export function toConfidence (agreement: Agreement): number {
  return Math.max(0, Math.min(1, agreement.correlation))
}

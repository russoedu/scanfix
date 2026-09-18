import { binarize, conjugateScale, correlation, decodeImage, decompose, downscaleGray, encodeImage, inkMap, intersectionOverUnion, invert, multiply, rebase, toGrayscale, translation, warpGray, warpRaster } from '@scanmate/ink'
import type { GrayImage, ImageFormat, ImageInput, InkOptions, Interpolation, Matrix3, Raster, TransformModel, TransformSummary } from '@scanmate/ink'
import { estimateCoarse } from './estimate/coarse'
import type { CoarseResult } from './estimate/coarse'
import { detectAndDescribe } from './estimate/features'
import { matchFeatures } from './estimate/match'
import { phaseCorrelate } from './estimate/phaseCorrelation'
import { ransac } from './estimate/ransac'

/**
 * Align a scan onto the page it was made from.
 *
 * ## What this is for
 *
 * Two questions about a returned form are easy to answer once the scan sits
 * exactly on top of the original, and near-impossible before:
 *
 * 1. *Was anything in the printed text changed?* Run OCR on both and diff.
 *    That only works if the two are the same page at the same size, otherwise
 *    the OCR engine's own layout analysis is comparing different documents.
 * 2. *Was the box at (x, y) signed?* That is a question about a fixed
 *    rectangle, and a fixed rectangle only means something once both images
 *    agree on where (x, y) is. See `compareRegions`.
 *
 * ## The pipeline
 *
 * ```text
 *   decode ─► ink  ─► coarse guess ─► rough warp ─► features ─► RANSAC ─► warp
 *                     (scale/skew)                  (ORB)       (model)
 * ```
 *
 * The coarse guess exists to make the feature stage possible at all: binary
 * descriptors compare fixed pixel offsets, so they only match between images
 * at comparable scale, and nothing in a JPEG tells you what dpi it was scanned
 * at. Once the scan has been resampled to roughly the right size, matching is
 * easy and RANSAC can throw away the inevitable wrong matches — a page of text
 * is full of genuinely identical-looking corners.
 *
 * If the feature stage comes up short (a nearly blank form has few corners to
 * find), the coarse estimate is returned on its own, and `method` says so.
 *
 * ## Why it is asynchronous
 *
 * The estimator is CPU-bound with no I/O to wait on, and an earlier version of
 * this function was synchronous to say so. The codec changed that: decoding and
 * encoding now run in libvips on libuv's threadpool, roughly an order of
 * magnitude faster than the pure-JavaScript codec they replaced, and during
 * those two stages the event loop genuinely is free. Between them it is not -
 * the coarse search, ORB and RANSAC all run to completion on this thread - so
 * to align several pages at once, still put this in a worker thread.
 */

export interface AlignOptions {
  /**
   * Transform family to fit.
   *
   * `similarity` (the default) covers a flatbed or sheet-fed scan: the page is
   * flat, so it can only be turned, resized and moved. Use `affine` when one
   * axis is stretched, and `homography` for photographs taken off-axis, where
   * the far edge of the page is genuinely smaller than the near one.
   */
  model?:                TransformModel
  /** Longest side used for feature detection. Bigger is more precise and quadratically slower. */
  workingSize?:          number
  /** Longest side used for the coarse guess. */
  coarseSize?:           number
  maxFeatures?:          number
  /** Inlier radius for RANSAC, in working-resolution pixels. */
  ransacThreshold?:      number
  /** Fewer surviving correspondences than this and the feature stage is not trusted. */
  minInliers?:           number
  /** Largest per-page skew the coarse stage considers, in degrees. */
  maxSkewDeg?:           number
  /** Cap on how much bigger or smaller the scan may be than the original. */
  maxScaleRatio?:        number
  /** How far a correspondence may move, as a fraction of the page diagonal, after the coarse warp. */
  maxDisplacementRatio?: number
  /** Background/ink separation. The defaults suit printed pages on white. */
  ink?:                  InkOptions
  interpolation?:        Interpolation
  /** RGBA fill where the scan does not cover the original's canvas. */
  background?:           [number, number, number, number]
  /** Encoding of `result.image`. `'none'` skips encoding, which is most of the cost on a big page. */
  output?:               ImageFormat | 'none'
  /** JPEG quality when `output` is `'jpeg'`. */
  quality?:              number
  /** Seeds RANSAC and the descriptor pattern, so the same input gives the same matrix. */
  seed?:                 number
}

export interface AlignDiagnostics {
  coarseScore:           number
  coarseStrategy:        string
  /** Each page's own skew, in degrees, as measured independently. */
  skewDeg:               { original: number, scanned: number }
  features:              { original: number, scanned: number }
  matches:               number
  inliers:               number
  inlierRatio:           number
  /** Mean RANSAC reprojection error over the inliers, in working-resolution pixels. */
  reprojectionError:     number
  /** Ink correlation after alignment, in `[-1, 1]`. */
  correlation:           number
  /** Ink mask overlap after alignment, in `[0, 1]`. */
  intersectionOverUnion: number
  /** Milliseconds spent, end to end. */
  durationMs:            number
}

export interface AlignResult {
  /** The scan resampled onto the original's canvas, same width and height as the original. */
  raster:      Raster
  /** `raster` encoded per `options.output`, or `null` when that was `'none'`. */
  image:       Uint8Array | null
  width:       number
  height:      number
  /** Maps original coordinates to scanned coordinates. */
  matrix:      Matrix3
  /** Maps scanned coordinates back to original coordinates. */
  inverse:     Matrix3
  transform:   TransformSummary
  /**
   * How much to trust the result, in `[0, 1]`.
   *
   * Derived from ink correlation after warping, so it measures agreement in the
   * output rather than confidence in the process. Above ~0.6 is a solid match on
   * a printed page; below ~0.3 treat the alignment as failed.
   */
  confidence:  number
  method:      'features' | 'coarse'
  diagnostics: AlignDiagnostics
}

export async function alignScan (
  original: ImageInput,
  scanned: ImageInput,
  options: AlignOptions = {},
): Promise<AlignResult> {
  const startedAt = Date.now()
  const {
    model = 'similarity',
    workingSize = 1400,
    coarseSize = 512,
    maxFeatures = 1200,
    ransacThreshold = 3,
    minInliers = 12,
    maxSkewDeg = 12,
    maxScaleRatio = 6,
    maxDisplacementRatio = 0.12,
    ink,
    interpolation = 'bilinear',
    background = [255, 255, 255, 255],
    output = 'png',
    quality = 92,
    seed = 0x5CA7F1,
  } = options

  const originalRaster = await decodeImage(original)
  const scannedRaster = await decodeImage(scanned)

  const originalInk = inkMap(toGrayscale(originalRaster), ink)
  const scannedInk = inkMap(toGrayscale(scannedRaster), ink)

  const coarse = estimateCoarse(originalInk, scannedInk, {
    workingSize: coarseSize,
    maxSkewDeg,
    maxScaleRatio,
  })

  const refined = refineWithFeatures(originalInk, scannedInk, coarse, {
    model,
    workingSize,
    maxFeatures,
    ransacThreshold,
    minInliers,
    maxDisplacementRatio,
    seed,
  })

  const matrix = refined.matrix
  const raster = warpRaster(scannedRaster, matrix, originalRaster.width, originalRaster.height, {
    background,
    interpolation,
    prefilter: true,
  })

  const agreement = measure(originalInk, scannedInk, matrix, workingSize)

  return {
    raster,
    image:       output === 'none' ? null : await encodeImage(raster, { format: output, quality }),
    width:       raster.width,
    height:      raster.height,
    matrix,
    inverse:     invert(matrix),
    transform:   decompose(matrix, model),
    confidence:  Math.max(0, Math.min(1, agreement.correlation)),
    method:      refined.method,
    diagnostics: {
      coarseScore:    coarse.score,
      coarseStrategy: coarse.strategy,
      skewDeg:        {
        original: (coarse.skew.original * 180) / Math.PI,
        scanned:  (coarse.skew.scanned * 180) / Math.PI,
      },
      features:              refined.features,
      matches:               refined.matches,
      inliers:               refined.inliers,
      inlierRatio:           refined.inlierRatio,
      reprojectionError:     refined.reprojectionError,
      correlation:           agreement.correlation,
      intersectionOverUnion: agreement.iou,
      durationMs:            Date.now() - startedAt,
    },
  }
}

interface RefineOptions {
  model:                TransformModel
  workingSize:          number
  maxFeatures:          number
  ransacThreshold:      number
  minInliers:           number
  maxDisplacementRatio: number
  seed:                 number
}

interface RefineResult {
  matrix:            Matrix3
  method:            'features' | 'coarse'
  features:          { original: number, scanned: number }
  matches:           number
  inliers:           number
  inlierRatio:       number
  reprojectionError: number
}

/**
 * Match features between the original and the *coarsely corrected* scan.
 *
 * Doing it after the coarse warp rather than before is what makes the whole
 * thing work. The two images now sit at the same scale and nearly the same
 * angle, so a fixed-offset binary descriptor describes the same thing on both,
 * and a correspondence that jumps across the page can be rejected on sight.
 * What RANSAC recovers is only the small residual, which is then composed onto
 * the coarse transform.
 */
function refineWithFeatures (
  originalInk: GrayImage,
  scannedInk: GrayImage,
  coarse: CoarseResult,
  options: RefineOptions,
): RefineResult {
  const fallback: RefineResult = {
    matrix:            coarse.matrix,
    method:            'coarse',
    features:          { original: 0, scanned: 0 },
    matches:           0,
    inliers:           0,
    inlierRatio:       0,
    reprojectionError: NaN,
  }

  const original = downscaleGray(originalInk, options.workingSize)
  const scanned = downscaleGray(scannedInk, options.workingSize)

  // The coarse matrix speaks full-resolution pixels; restate it between the two
  // working frames, which were shrunk by different amounts.
  const coarseWork = rebase(coarse.matrix, 1 / original.scale, 1 / scanned.scale)
  const rough = warpGray(scanned.image, coarseWork, original.image.width, original.image.height, 0)

  const originalFeatures = detectAndDescribe(original.image, { maxFeatures: options.maxFeatures, seed: options.seed })
  const scannedFeatures = detectAndDescribe(rough, { maxFeatures: options.maxFeatures, seed: options.seed })
  const counts = { original: originalFeatures.keypoints.length, scanned: scannedFeatures.keypoints.length }

  const diagonal = Math.hypot(original.image.width, original.image.height)
  const matches = matchFeatures(originalFeatures, scannedFeatures, {
    maxDisplacement: diagonal * options.maxDisplacementRatio,
  })

  const consensus = ransac(matches, {
    model:      options.model,
    threshold:  options.ransacThreshold,
    minInliers: options.minInliers,
    seed:       options.seed,
  })

  if (consensus === null) return { ...fallback, features: counts, matches: matches.length }

  // RANSAC's matrix maps the original's working frame onto the rough warp,
  // which lives in that same frame. Scale it back up, then compose: original ->
  // rough -> scan.
  const residual = conjugateScale(consensus.matrix, original.scale)

  return {
    matrix:            multiply(coarse.matrix, residual),
    method:            'features',
    features:          counts,
    matches:           matches.length,
    inliers:           consensus.inliers.length,
    inlierRatio:       consensus.inlierRatio,
    reprojectionError: consensus.error,
  }
}

/** Ink correlation and mask overlap after warping, computed at a modest resolution. */
function measure (
  originalInk: GrayImage,
  scannedInk: GrayImage,
  matrix: Matrix3,
  workingSize: number,
): { correlation: number, iou: number } {
  const original = downscaleGray(originalInk, Math.min(workingSize, 800))
  const scanned = downscaleGray(scannedInk, Math.min(workingSize, 800))
  const work = rebase(matrix, 1 / original.scale, 1 / scanned.scale)
  const warped = warpGray(scanned.image, work, original.image.width, original.image.height, 0)

  return {
    correlation: correlation(original.image, warped),
    iou:         intersectionOverUnion(binarize(original.image), binarize(warped)),
  }
}

/**
 * Nudge an existing transform by whatever residual translation is still measurable.
 *
 * Exposed because it is occasionally useful on its own: if you already know the
 * transform from a previous page of the same batch, this re-seats it on the
 * current page for a fraction of the cost of a full alignment.
 */
export function polishTranslation (
  originalInk: GrayImage,
  scannedInk: GrayImage,
  matrix: Matrix3,
  workingSize = 512,
): Matrix3 {
  const original = downscaleGray(originalInk, workingSize)
  const scanned = downscaleGray(scannedInk, workingSize)
  const work = rebase(matrix, 1 / original.scale, 1 / scanned.scale)
  const warped = warpGray(scanned.image, work, original.image.width, original.image.height, 0)

  const shift = phaseCorrelate(original.image, warped)
  if (!Number.isFinite(shift.dx) || !Number.isFinite(shift.dy)) return matrix

  const corrected = multiply(work, translation(shift.dx, shift.dy))
  const candidate = rebase(corrected, original.scale, scanned.scale)

  const before = correlation(original.image, warped)
  const after = correlation(
    original.image,
    warpGray(scanned.image, corrected, original.image.width, original.image.height, 0),
  )

  return after > before ? candidate : matrix
}

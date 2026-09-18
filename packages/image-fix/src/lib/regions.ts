import { binarize, coverage, decodeImage, dilate, inkMap, toGrayscale } from '@scanmate/ink'
import type { BinaryImage, ImageInput, InkOptions, Raster, Rect } from '@scanmate/ink'

/**
 * What changed, and where.
 *
 * Once the scan sits on the original's canvas, "was this box signed?" stops
 * being an image problem and becomes arithmetic: count the ink inside the
 * rectangle that is present in the scan and absent from the original.
 *
 * The one subtlety is the tolerance band. Alignment is good to a pixel or so,
 * never to zero, and printed text is mostly edges — so a half-pixel shift
 * lights up the outline of every character as "new ink". Dilating the
 * original's mask first (fattening every stroke by a couple of pixels) absorbs
 * that, the way a proofreader ignores a letter sitting a hair off the baseline.
 * What it cannot absorb is a signature, which is ink in places the original has
 * none.
 */

export interface Region {
  id:         string
  /** In the *original's* pixel coordinates - the whole point of aligning first. */
  rect:       Rect
  /** Fraction of the region that must be new ink before `filled` is true. Overrides the global default. */
  threshold?: number
}

export interface RegionOptions {
  ink?:       InkOptions
  /**
   * Radius, in pixels, that the original's ink is fattened by before diffing.
   * Raise it if alignment is loose; lower it to catch very fine additions.
   */
  tolerance?: number
  /** Default fraction of new ink that counts as filled. */
  threshold?: number
}

export interface RegionReport {
  id:          string
  rect:        Rect
  /** Ink coverage of the region in the original, in `[0, 1]`. */
  originalInk: number
  /** Ink coverage of the region in the aligned scan. */
  scanInk:     number
  /** Coverage that is ink in the scan and not within `tolerance` of ink in the original. */
  added:       number
  /** Coverage that is ink in the original and missing from the scan. Mostly a faint-scan warning. */
  removed:     number
  filled:      boolean
  /** `added` as a multiple of the threshold, clamped to `[0, 1]`. A reportable confidence. */
  score:       number
}

export interface DocumentDiff {
  /** Page-wide version of {@link RegionReport.added}. */
  added:   number
  removed: number
  regions: RegionReport[]
}

/**
 * Compare an aligned scan against its original over a set of known rectangles.
 *
 * `aligned` must be the output of `alignScan` - or anything else already on the
 * original's canvas. Feeding a raw scan in produces confident nonsense, because
 * every rectangle then names a different part of the page in each image.
 */
export function compareRegions (
  original: ImageInput,
  aligned: ImageInput,
  regions: readonly Region[],
  options: RegionOptions = {},
): RegionReport[] {
  const { tolerance = 2, threshold = 0.02, ink } = options
  const masks = buildMasks(original, aligned, ink, tolerance)

  return regions.map(region => report(region, masks, threshold))
}

/** Page-wide added/removed ink, plus per-region detail for any regions supplied. */
export function diffDocument (
  original: ImageInput,
  aligned: ImageInput,
  regions: readonly Region[] = [],
  options: RegionOptions = {},
): DocumentDiff {
  const { tolerance = 2, threshold = 0.02, ink } = options
  const masks = buildMasks(original, aligned, ink, tolerance)
  const full: Rect = { x: 0, y: 0, width: masks.width, height: masks.height }
  const whole = report({ id: '__document__', rect: full }, masks, threshold)

  return {
    added:   whole.added,
    removed: whole.removed,
    regions: regions.map(region => report(region, masks, threshold)),
  }
}

/**
 * An RGBA overlay of the comparison, for looking at with your own eyes.
 *
 * Red is ink the scan added, blue is ink it lost, grey is ink both agree on.
 * A correctly aligned pair of a signed form is almost entirely grey with a red
 * signature; a misaligned one is red and blue confetti along every stroke,
 * which is the fastest way to tell the two failures apart.
 */
export function renderDiff (
  original: ImageInput,
  aligned: ImageInput,
  options: RegionOptions = {},
): Raster {
  const { tolerance = 2, ink } = options
  const masks = buildMasks(original, aligned, ink, tolerance)
  const { width, height } = masks
  const data = new Uint8ClampedArray(width * height * 4)

  for (let i = 0, p = 0; p < width * height; p++, i += 4) {
    const inOriginal = masks.original.data[p] === 1
    const inScan = masks.scan.data[p] === 1
    const nearOriginal = masks.originalDilated.data[p] === 1

    let r = 255
    let g = 255
    let b = 255

    if (inScan && !nearOriginal) {
      r = 220
      g = 30
      b = 40
    } else if (inOriginal && masks.scanDilated.data[p] === 0) {
      r = 40
      g = 90
      b = 220
    } else if (inOriginal || inScan) {
      r = 110
      g = 110
      b = 110
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }

  return { width, height, data }
}

interface Masks {
  width:           number
  height:          number
  original:        BinaryImage
  scan:            BinaryImage
  originalDilated: BinaryImage
  scanDilated:     BinaryImage
}

function buildMasks (
  original: ImageInput,
  aligned: ImageInput,
  ink: InkOptions | undefined,
  tolerance: number,
): Masks {
  const originalRaster = decodeImage(original)
  const alignedRaster = decodeImage(aligned)

  if (originalRaster.width !== alignedRaster.width || originalRaster.height !== alignedRaster.height)
    throw new Error(
      `compareRegions needs both images on the same canvas: got ${originalRaster.width}x${originalRaster.height} and ${alignedRaster.width}x${alignedRaster.height}. Align the scan first.`,
    )

  const originalMask = binarize(inkMap(toGrayscale(originalRaster), ink))
  const scanMask = binarize(inkMap(toGrayscale(alignedRaster), ink))

  return {
    width:           originalRaster.width,
    height:          originalRaster.height,
    original:        originalMask,
    scan:            scanMask,
    originalDilated: dilate(originalMask, tolerance),
    scanDilated:     dilate(scanMask, tolerance),
  }
}

function report (region: Region, masks: Masks, defaultThreshold: number): RegionReport {
  const { x, y, width, height } = region.rect
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const right = Math.min(masks.width, Math.ceil(x + width))
  const bottom = Math.min(masks.height, Math.ceil(y + height))

  if (right <= left || bottom <= top)
    return {
      id:          region.id,
      rect:        region.rect,
      originalInk: 0,
      scanInk:     0,
      added:       0,
      removed:     0,
      filled:      false,
      score:       0,
    }

  const threshold = region.threshold ?? defaultThreshold
  let added = 0
  let removed = 0
  for (let row = top; row < bottom; row++) {
    const offset = row * masks.width
    for (let column = left; column < right; column++) {
      const p = offset + column
      if (masks.scan.data[p] === 1 && masks.originalDilated.data[p] === 0) added++
      if (masks.original.data[p] === 1 && masks.scanDilated.data[p] === 0) removed++
    }
  }

  const area = (right - left) * (bottom - top)
  const addedRatio = added / area

  return {
    id:          region.id,
    rect:        region.rect,
    originalInk: coverage(masks.original, left, top, right, bottom),
    scanInk:     coverage(masks.scan, left, top, right, bottom),
    added:       addedRatio,
    removed:     removed / area,
    filled:      addedRatio >= threshold,
    score:       threshold > 0 ? Math.min(1, addedRatio / threshold) : 0,
  }
}

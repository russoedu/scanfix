import type { ImageFormat, InkOptions, ProgressCallback, Raster } from '@scanmate/ink'

/**
 * Coordinates for regions going in and changes coming out.
 *
 * `points` (the default) are PDF points, 1/72 inch, from the page's top-left
 * corner - the units a document generator already knows its fields in, and the
 * only ones that stay put when `@scanmate/extract` renders each document at its
 * scan's resolution. `pixels` are the original's rendered pixels, for callers
 * working from images rather than PDFs.
 */
export type CoordinateUnits = 'points' | 'pixels'

/** A place on a page where a change is expected - a signature box, a tick box. */
export interface ExpectedChange {
  /** One-based page number in the original. */
  page:   number
  id:     string
  x:      number
  y:      number
  width:  number
  height: number
}

export interface DiffOptions {
  /** Units of `ExpectedChange` rectangles and of every rectangle reported back. Default `'points'`. */
  units?:          CoordinateUnits
  /** Pixels the original's ink is fattened by before diffing, to absorb sub-pixel misalignment. Default `2`. */
  tolerance?:      number
  /** Fraction of an expected region that must be new ink for it to count as identified. Default `0.02`. */
  threshold?:      number
  /**
   * Smallest change worth reporting, in square millimetres of ink. Default `1`.
   *
   * Measured on real scans: after merging, the largest noise specks came to
   * 0.31-0.85 mm2, while a tick in a 6 mm box is about 5 mm2 and a signature
   * tens of mm2. Physical units, because the render resolution varies with the
   * scan and the same speck is four times the pixels at twice the dpi.
   */
  minChangeArea?:  number
  /**
   * Smallest loss of original ink worth reporting, in square millimetres.
   * Default `4`.
   *
   * Higher than `minChangeArea` on purpose. The poorest of three real scans
   * softened the ends of solid header bars into strips of 1-8 mm2 of apparent
   * loss on most pages, while an erased word, a line or a paragraph measured
   * 8-22 mm2 and more. Losses too small to clear this - a deleted three-letter
   * word is about 1 mm2 - are textual, and are what `@scanmate/ocr` compares
   * text for.
   */
  minMissingArea?: number
  /**
   * Scan ink fainter than this fraction of the scan's own ink threshold counts
   * as gone. Scanners wash colour out - a red link comes back pink - and faded
   * is not missing. Default `0.25`.
   */
  faintInk?:       number
  /**
   * Changes within this many millimetres of each other are one change - the
   * strokes and dots of a signature, the two arms of a tick. Default `3`.
   */
  mergeGap?:       number
  /** Resolution assumed for a page that does not say what it was rendered at. Default `150`. */
  assumeDpi?:      number
  /** Fraction of a change's ink inside an expected region for the change to count as expected. Default `0.5`. */
  regionOverlap?:  number
  /**
   * Most changes reported per page, largest first. A badly aligned page turns
   * every stroke into a change; past this it is reported as `truncated`
   * instead of as a thousand boxes. Default `50`.
   */
  maxChanges?:     number
  /** Encoding of `diffImage`. `'none'` skips it. Default `'png'`. */
  output?:         ImageFormat | 'none'
  /** Draw each expected region and each unexpected change onto the overlay. Default `false`. */
  annotate?:       boolean
  ink?:            InkOptions
  onProgress?:     ProgressCallback
}

/** What happened in one expected region. */
export interface ExpectedResult {
  id:         string
  /** The region gained enough new ink to count as filled in. */
  identified: boolean
  /** The region as given, in the requested units. */
  x:          number
  y:          number
  width:      number
  height:     number
  /** Fraction of the region that is new ink. */
  addedInk:   number
  /** Fraction of the region whose original ink is gone. */
  removedInk: number
  /** `addedInk` as a multiple of the threshold, clamped to `[0, 1]`. */
  score:      number
}

/** A change found where nothing was expected, or ink that went missing. */
export interface Change {
  /** Bounding box, in the requested units. */
  x:       number
  y:       number
  width:   number
  height:  number
  /** Changed ink, in square millimetres. */
  inkArea: number
  /** Changed pixels. */
  pixels:  number
}

export interface PageDiff {
  page:       number
  /** The overlay: red added, blue lost, grey agreed - annotated when asked. */
  diffRaster: Raster
  diffImage:  Uint8Array | null
  expected:   ExpectedResult[]
  /** New ink outside every expected region, merged into one box per change. */
  unexpected: Change[]
  /**
   * Original ink the scan lost. A dropped line is as suspicious as an added one.
   * A scan blurry enough to wash out a hairline rule reports that rule here too:
   * it is gone from the image, whatever happened to the paper.
   */
  missing:    Change[]
  /** More changes than `maxChanges` were found - usually a sign the alignment failed. */
  truncated:  boolean
  summary: {
    /** Page-wide fraction of new ink. */
    addedInk:      number
    removedInk:    number
    identified:    number
    notIdentified: number
    unexpected:    number
    missing:       number
  }
}

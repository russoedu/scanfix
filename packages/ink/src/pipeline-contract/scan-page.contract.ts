import type { Matrix3 } from '../plane-geometry'
import type { Raster } from '../raster-codec'

/**
 * The shapes the pipeline stages hand one another.
 *
 * They live here rather than beside whichever stage produces them so that no
 * stage has to import another to accept its output: `@scanmate/align` accepts
 * what `@scanmate/extract` produces without depending on it, and `diff` and `ocr`
 * accept what `align` produces the same way. Each stage consumes the previous
 * one's output structurally, which is what lets an orchestrator later be a plain
 * pipe rather than a layer of adapters.
 */

/** One side of a page pair: the pixels, and what the producer knew about them. */
export interface PageImage {
  raster: Raster
  /** `raster` encoded, or `null` when the producer skipped encoding. */
  image:  Uint8Array | null
  width:  number
  height: number
  /** Resolution the raster was produced at, or `null` when nothing said - a bare image file. */
  dpi:    number | null
}

/** A page of the original and the matching page of what came back. */
export interface ScanPage {
  /** One-based page number in the original. */
  page:     number
  original: PageImage
  scanned:  PageImage
}

/**
 * What a downstream stage needs from an alignment.
 *
 * `@scanmate/align`'s `AlignResult` carries this and a good deal more; any
 * stage that only needs the aligned pixels and the transform asks for this, so
 * it stays independent of the aligner that produced them.
 */
export interface AlignedImage {
  /** The scan resampled onto the original's canvas, same width and height as the original. */
  raster:     Raster
  image:      Uint8Array | null
  width:      number
  height:     number
  /** Maps original coordinates to scanned coordinates. */
  matrix:     Matrix3
  /** Maps scanned coordinates back to original coordinates. */
  inverse:    Matrix3
  /** How far to trust the alignment, in `[0, 1]`. */
  confidence: number
}

/** A {@link ScanPage} with the scan put back on the original's canvas. */
export interface AlignedPage<Aligned extends AlignedImage = AlignedImage> extends ScanPage {
  aligned: Aligned
}

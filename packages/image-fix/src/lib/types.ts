/**
 * Core data types.
 *
 * Everything in this library speaks two image shapes and nothing else:
 *
 * - {@link Raster} — what you get in and out: 8-bit RGBA, the same memory
 *   layout a `<canvas>` `ImageData` uses, so it needs no conversion to be
 *   re-encoded, handed to an OCR engine, or drawn.
 * - {@link GrayImage} — what the algorithms work on: one float per pixel.
 *   Float, not byte, because the pipeline divides by an estimated background
 *   and then correlates the result; doing that in 8 bits throws away the
 *   faint strokes that OCR cares about.
 */

/** A decoded image: 8-bit RGBA, row-major, 4 bytes per pixel, no padding. */
export interface Raster {
  width:  number
  height: number
  /** `width * height * 4` bytes, in R, G, B, A order. */
  data:   Uint8ClampedArray
}

/** A single-channel image. Values are normally in `[0, 1]` but are not clamped. */
export interface GrayImage {
  width:  number
  height: number
  data:   Float32Array
}

/** A single-channel mask. Every value is exactly `0` or `1`. */
export interface BinaryImage {
  width:  number
  height: number
  data:   Uint8Array
}

/**
 * A row-major 3x3 matrix in homogeneous coordinates:
 *
 * ```text
 * [ m0 m1 m2 ]
 * [ m3 m4 m5 ]
 * [ m6 m7 m8 ]
 * ```
 */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number]

export interface Point {
  x: number
  y: number
}

/** An axis-aligned rectangle in pixel coordinates. `x`/`y` are the top-left corner. */
export interface Rect {
  x:      number
  y:      number
  width:  number
  height: number
}

/** Anything the library will accept as an image: an encoded PNG/JPEG, or an already-decoded raster. */
export type ImageInput = Raster | Uint8Array | ArrayBuffer

/** Which family of transform to fit. Fewer degrees of freedom is more robust; more is more expressive. */
export type TransformModel =
  /** 4 DOF: uniform scale, rotation, translation. A flatbed scan of a flat page. */
  | 'similarity' |
  /** 6 DOF: adds non-uniform scale and shear. A scan whose feed stretched one axis. */
  'affine' |
  /** 8 DOF: full projective warp. A photograph taken off-axis. */
  'homography'

/** The geometric meaning of a fitted matrix, pulled apart into numbers a human can sanity-check. */
export interface TransformSummary {
  model:       TransformModel
  /** Scale along the scan's x axis. `1` means the scan matches the original's pixel scale. */
  scaleX:      number
  scaleY:      number
  /** Rotation in degrees, counter-clockwise positive in image coordinates. */
  rotationDeg: number
  /** Residual shear in degrees. Non-zero only for `affine` and `homography`. */
  shearDeg:    number
  /** Where the original's top-left corner lands in the scan. */
  translation: Point
  /** Perspective terms (`m6`, `m7`). Non-zero only for `homography`. */
  perspective: Point
}

/** One `(original, scanned)` correspondence produced by feature matching. */
export interface PointMatch {
  source:   Point
  target:   Point
  /** Hamming distance between the two descriptors. Lower is a better match. */
  distance: number
}

import type { AlignedImage, ImageFormat, InkOptions, Interpolation, TransformModel, TransformSummary } from '@scanmate/ink'

export interface AlignOptions {
  /**
   * Transform family to fit, or `'all'` to let the page decide.
   *
   * `'all'` (the default) tries the families in {@link AlignOptions.models}
   * order, cheapest and most robust first, and stops at the first one that
   * reaches {@link AlignOptions.confidenceTarget}. Name one family to fit only
   * that: `similarity` for a flatbed or sheet-fed scan, which can only turn,
   * resize and move a flat page; `affine` when one axis is stretched;
   * `homography` for a photograph taken off-axis, where the far edge of the page
   * is genuinely smaller than the near one.
   */
  model?:                 TransformModel | 'all'
  /**
   * With `model: 'all'`, stop trying further models once one reaches this
   * confidence, in `[0, 1]`. A value above 1 is never reached, so every model
   * is tried. Default `0.9`.
   */
  confidenceTarget?:      number
  /** With `model: 'all'`, which families to try and in what order. */
  models?:                readonly TransformModel[]
  /**
   * With `model: 'all'`, how much a more complex model must beat a simpler one
   * by to replace it. Without it, a homography wins on a flat page by fitting
   * the page's noise. Default `0.02`.
   */
  modelPreferenceMargin?: number
  /** Longest side used for feature detection. Bigger is more precise and quadratically slower. */
  workingSize?:           number
  /** Longest side used for the coarse guess. */
  coarseSize?:            number
  maxFeatures?:           number
  /** Inlier radius for RANSAC, in working-resolution pixels. */
  ransacThreshold?:       number
  /** Fewer surviving correspondences than this and the feature stage is not trusted. */
  minInliers?:            number
  /** Largest per-page skew the coarse stage considers, in degrees. */
  maxSkewDeg?:            number
  /** Cap on how much bigger or smaller the scan may be than the original. */
  maxScaleRatio?:         number
  /** How far a correspondence may move, as a fraction of the page diagonal, after the coarse warp. */
  maxDisplacementRatio?:  number
  /** Background/ink separation. The defaults suit printed pages on white. */
  ink?:                   InkOptions
  interpolation?:         Interpolation
  /** RGBA fill where the scan does not cover the original's canvas. */
  background?:            [number, number, number, number]
  /** Encoding of `result.image`. `'none'` skips encoding, which is most of the cost on a big page. */
  output?:                ImageFormat | 'none'
  /** Quality when `output` is a lossy format. */
  quality?:               number
  /** Seeds RANSAC and the descriptor pattern, so the same input gives the same matrix. */
  seed?:                  number
}

/** One model the sweep tried, and how it did. */
export interface ModelAttempt {
  model:             TransformModel
  /** `null` when RANSAC found no consensus, so the model was never scored. */
  confidence:        number | null
  inliers:           number
  inlierRatio:       number
  /** Mean RANSAC reprojection error over the inliers, in working-resolution pixels. `NaN` when rejected. */
  reprojectionError: number
  /** RANSAC found no consensus worth trusting for this model. */
  rejected:          boolean
  /** This attempt's transform is the one returned. */
  selected:          boolean
}

export interface AlignDiagnostics {
  coarseScore:           number
  coarseStrategy:        string
  /** Each page's own skew, in degrees, as measured independently. */
  skewDeg:               { original: number, scanned: number }
  features:              { original: number, scanned: number }
  matches:               number
  /** Inliers behind the returned transform. Zero when the coarse estimate was returned. */
  inliers:               number
  inlierRatio:           number
  /** Mean RANSAC reprojection error over the returned model's inliers, in working-resolution pixels. */
  reprojectionError:     number
  /** Ink correlation after alignment, in `[-1, 1]`. */
  correlation:           number
  /** Ink mask overlap after alignment, in `[0, 1]`. */
  intersectionOverUnion: number
  /**
   * The family of the returned transform. The coarse estimate is itself a
   * similarity, so a coarse fallback reports `similarity` - `method` says which.
   */
  selectedModel:         TransformModel
  /** Every model tried, in order. Its length says whether the sweep stopped early. */
  attempts:              ModelAttempt[]
  /** Milliseconds spent, end to end. */
  durationMs:            number
}

export interface AlignResult extends AlignedImage {
  transform:   TransformSummary
  /**
   * How much to trust the result, in `[0, 1]`.
   *
   * Derived from ink correlation after warping, so it measures agreement in the
   * output rather than confidence in the process. Above ~0.6 is a solid match on
   * a printed page; below ~0.3 treat the alignment as failed.
   */
  confidence:  number
  /** `features` when RANSAC found a consensus, `coarse` when the coarse estimate had to stand alone. */
  method:      'features' | 'coarse'
  diagnostics: AlignDiagnostics
}

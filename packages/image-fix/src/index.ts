/**
 * `@scanmate/image-fix` - **deprecated**. Use the focused packages instead.
 *
 * This package has been split. Every export below still works and still means
 * what it meant, but it now comes from one of:
 *
 * | What you used | Where it lives now |
 * |---|---|
 * | `alignScan`, `polishTranslation`, and the estimator building blocks | `@scanmate/align` |
 * | `compareRegions`, `diffDocument`, `renderDiff` | `@scanmate/diff` |
 * | rasters, ink, warps, matrices, scoring, synthetic fixtures | `@scanmate/ink` |
 *
 * Nothing here is a permanent forwarding layer - this barrel exists so the split
 * is not a breaking change on the day it lands, and it will be removed.
 *
 * @deprecated Import from `@scanmate/align`, `@scanmate/diff` or `@scanmate/ink`.
 */

// --- This package's own behaviour ---

export { alignScan, polishTranslation } from './lib/align'
export type { AlignDiagnostics, AlignOptions, AlignResult } from './lib/align'

export { compareRegions, diffDocument, renderDiff } from './lib/regions'
export type { DocumentDiff, Region, RegionOptions, RegionReport } from './lib/regions'

export { estimateCoarse } from './lib/estimate/coarse'
export type { CoarseOptions, CoarseResult } from './lib/estimate/coarse'
export { detectAndDescribe } from './lib/estimate/features'
export type { FeatureOptions, FeatureSet, Keypoint } from './lib/estimate/features'
export { hamming, matchFeatures, popcount } from './lib/estimate/match'
export type { MatchOptions } from './lib/estimate/match'
export { fitAffine, fitHomography, fitModel, fitSimilarity, minimumSamples } from './lib/estimate/models'
export type { Correspondence } from './lib/estimate/models'
export { phaseCorrelate } from './lib/estimate/phaseCorrelation'
export type { PhaseCorrelationResult } from './lib/estimate/phaseCorrelation'
export { findInliers, ransac } from './lib/estimate/ransac'
export type { RansacOptions, RansacResult } from './lib/estimate/ransac'

// --- Re-exported from @scanmate/ink, unchanged ---

export {
  applyPoint,
  binarize,
  boxBlur,
  boxBlurRaster,
  cloneRaster,
  conjugateScale,
  contentExtent,
  correlation,
  coverage,
  createBinary,
  createGray,
  createRaster,
  createSyntheticDocument,
  decodeImage,
  decompose,
  determinant,
  dilate,
  downscaleGray,
  drawSignature,
  drawTick,
  encodeImage,
  estimateSkew,
  grayToRaster,
  IDENTITY,
  inkMap,
  intersectionOverUnion,
  invert,
  isPlausible,
  isRaster,
  mapRectCorners,
  mean,
  multiply,
  normalize,
  otsuThreshold,
  rebase,
  reprojectionError,
  resizeGray,
  sampleGrayBilinear,
  scaling,
  similarity,
  simulateScan,
  sniffFormat,
  toGrayscale,
  translation,
  warpGray,
  warpRaster,
} from '@scanmate/ink'

export type {
  BinaryImage,
  ContentExtent,
  DocumentOptions,
  EncodeOptions,
  GrayImage,
  ImageFormat,
  ImageInput,
  InkOptions,
  Interpolation,
  Matrix3,
  Point,
  PointMatch,
  Raster,
  Rect,
  ScanOptions,
  SimulatedScan,
  SkewOptions,
  SyntheticDocument,
  TransformModel,
  TransformSummary,
  WarpOptions,
} from '@scanmate/ink'

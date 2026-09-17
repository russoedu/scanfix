/**
 * `@scanfix/align` - put a scanned page back on top of the page it came from.
 *
 * ```ts
 * import { readFile } from 'node:fs/promises'
 * import { alignScan, compareRegions } from '@scanfix/align'
 *
 * const original = await readFile('contract.page1.png')  // rendered from the PDF
 * const scanned = await readFile('returned.jpg')         // what came back
 *
 * const result = alignScan(original, scanned)
 * console.log(result.confidence, result.transform.rotationDeg)
 *
 * const [signature] = compareRegions(original, result.raster, [
 *   { id: 'signature', rect: { x: 76, y: 905, width: 420, height: 78 } },
 * ])
 * console.log(signature.filled)
 * ```
 *
 * `result.raster` is on the original's canvas, so every coordinate you already
 * know from the PDF still means what it meant - which is what makes both an
 * OCR diff and a "was this box signed" check possible.
 *
 * Everything here is pure JavaScript. No native bindings, so nothing to rebuild
 * per platform when it deploys to an Azure Function app.
 */

export { alignScan, polishTranslation } from './lib/align'
export type { AlignDiagnostics, AlignOptions, AlignResult } from './lib/align'

export { compareRegions, diffDocument, renderDiff } from './lib/regions'
export type { DocumentDiff, Region, RegionOptions, RegionReport } from './lib/regions'

export type {
  BinaryImage,
  GrayImage,
  ImageInput,
  Matrix3,
  Point,
  PointMatch,
  Raster,
  Rect,
  TransformModel,
  TransformSummary,
} from './lib/types'

// --- Building blocks, for pipelines that need to stop part way ---

export { decodeImage, encodeImage, sniffFormat } from './lib/image/codec'
export type { EncodeOptions, ImageFormat } from './lib/image/codec'

export { binarize, boxBlur, coverage, dilate, grayToRaster, inkMap, otsuThreshold, toGrayscale } from './lib/image/gray'
export type { InkOptions } from './lib/image/gray'

export { createBinary, createGray, createRaster, cloneRaster, isRaster } from './lib/image/raster'
export { boxBlurRaster, downscaleGray, resizeGray } from './lib/image/resize'
export { sampleGrayBilinear, warpGray, warpRaster } from './lib/image/warp'
export type { Interpolation, WarpOptions } from './lib/image/warp'

export { contentExtent, estimateSkew } from './lib/analysis/content'
export type { ContentExtent, SkewOptions } from './lib/analysis/content'
export { correlation, intersectionOverUnion, mean } from './lib/analysis/score'

export {
  applyPoint,
  conjugateScale,
  decompose,
  determinant,
  IDENTITY,
  invert,
  isPlausible,
  mapRectCorners,
  multiply,
  normalize,
  rebase,
  reprojectionError,
  scaling,
  similarity,
  translation,
} from './lib/math/matrix'

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

// --- Test fixtures, useful for smoke-testing a deployment ---

export {
  createSyntheticDocument,
  drawSignature,
  drawTick,
  simulateScan,
} from './lib/testing/synthetic'
export type {
  DocumentOptions,
  ScanOptions,
  SimulatedScan,
  SyntheticDocument,
} from './lib/testing/synthetic'

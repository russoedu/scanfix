/**
 * `@scanmate/align` - put a scanned page back on top of the page it came from.
 *
 * ```ts
 * import { decodeImage } from '@scanmate/ink'
 * import { alignScan } from '@scanmate/align'
 *
 * const result = await alignScan(await decodeImage('page1.png'), await decodeImage('returned.jpg'))
 * console.log(result.confidence, result.transform.rotationDeg)
 * ```
 *
 * `result.raster` sits on the original's canvas, at the original's width and
 * height, so every coordinate known from the PDF still means what it meant.
 */

export { alignScan, polishTranslation } from './scan-alignment'
export type { AlignDiagnostics, AlignOptions, AlignResult } from './scan-alignment'

// --- Building blocks, for pipelines that need to stop part way ---

export { estimateCoarse } from './coarse-estimation'
export type { CoarseOptions, CoarseResult } from './coarse-estimation'
export { detectAndDescribe, hamming, matchFeatures, popcount } from './feature-matching'
export type { FeatureOptions, FeatureSet, Keypoint, MatchOptions } from './feature-matching'
export { phaseCorrelate } from './phase-correlation'
export type { PhaseCorrelationResult } from './phase-correlation'
export { findInliers, fitAffine, fitHomography, fitModel, fitSimilarity, minimumSamples, ransac } from './transform-fitting'
export type { Correspondence, RansacOptions, RansacResult } from './transform-fitting'

/** Fitting a similarity, affine or homography to correspondences, and RANSAC to find which ones to trust. */

export { fitAffine, fitHomography, fitModel, fitSimilarity, minimumSamples } from './fit-transform.use-case'
export type { Correspondence } from './fit-transform.use-case'
export { findInliers, ransac } from './ransac.use-case'
export type { RansacOptions, RansacResult } from './ransac.use-case'

/** Resampling: resize, and warp through a 3x3 matrix. */

export { boxBlurRaster, downscaleGray, resizeGray } from './resize-gray.use-case'
export { sampleGrayBilinear, warpGray, warpRaster } from './warp.use-case'
export type { Interpolation, WarpOptions } from './warp.use-case'

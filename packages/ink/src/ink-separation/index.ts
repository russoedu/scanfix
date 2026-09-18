/** Greyscale to ink, and ink to a mask. */

export { boxBlur, grayToRaster, inkMap, integralImage, toGrayscale } from './ink-map.use-case'
export type { InkOptions } from './ink-map.use-case'
export { binarize, coverage, dilate, otsuThreshold } from './ink-mask.use-case'

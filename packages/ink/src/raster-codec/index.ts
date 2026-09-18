/** The two image shapes everything speaks, and the bytes they come from. */

export { decodeImage, encodeImage, sniffFormat } from './image-codec.use-case'
export type { EncodeOptions, ImageFormat } from './image-codec.use-case'
export { asClamped, cloneRaster, createBinary, createGray, createRaster, isRaster, toBytes } from './raster.model'
export type { BinaryImage, GrayImage, ImageInput, Raster } from './raster.model'

import { binarize, decodeImage, dilate, inkMap, toGrayscale } from '@scanmate/ink'
import type { BinaryImage, ImageInput, InkOptions } from '@scanmate/ink'

/**
 * The two ink masks every comparison starts from, plus their tolerance bands.
 *
 * Both images must already share a canvas - that is what alignment is for - so
 * a size mismatch is refused outright rather than compared into nonsense.
 */

export interface Masks {
  width:           number
  height:          number
  original:        BinaryImage
  scan:            BinaryImage
  originalDilated: BinaryImage
  scanDilated:     BinaryImage
}

export async function buildMasks (
  original: ImageInput,
  aligned: ImageInput,
  ink: InkOptions | undefined,
  tolerance: number,
): Promise<Masks> {
  const originalRaster = await decodeImage(original)
  const alignedRaster = await decodeImage(aligned)

  if (originalRaster.width !== alignedRaster.width || originalRaster.height !== alignedRaster.height)
    throw new Error(
      `compareRegions needs both images on the same canvas: got ${originalRaster.width}x${originalRaster.height} and ${alignedRaster.width}x${alignedRaster.height}. Align the scan first.`,
    )

  const originalMask = binarize(inkMap(toGrayscale(originalRaster), ink))
  const scanMask = binarize(inkMap(toGrayscale(alignedRaster), ink))

  return {
    width:           originalRaster.width,
    height:          originalRaster.height,
    original:        originalMask,
    scan:            scanMask,
    originalDilated: dilate(originalMask, tolerance),
    scanDilated:     dilate(scanMask, tolerance),
  }
}

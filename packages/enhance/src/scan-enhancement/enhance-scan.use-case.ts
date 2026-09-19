import { decodeImage, encodeImage } from '@scanmate/ink'
import type { ImageInput } from '@scanmate/ink'

import { enhanceRaster } from '../illumination-correction'
import type { EnhanceResult, EnhanceScanOptions } from './enhance-result.contract'

/**
 * Clean one image: any raster, encoded image or path `@scanmate/ink` can decode.
 *
 * Decoding and encoding go through libvips and are asynchronous; the cleaning
 * itself runs to completion on the calling thread.
 */
export async function enhanceScan (input: ImageInput, options: EnhanceScanOptions = {}): Promise<EnhanceResult> {
  const { output = 'png', quality = 92, ...enhance } = options
  const { raster, applied } = enhanceRaster(await decodeImage(input), enhance)

  return {
    raster,
    image:  output === 'none' ? null : await encodeImage(raster, { format: output, quality }),
    width:  raster.width,
    height: raster.height,
    applied,
  }
}

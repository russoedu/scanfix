import type { AlignedPage, ImageFormat, PageImage, ProgressCallback, Raster } from '@scanmate/ink'

import type { AppliedEnhancement, EnhanceOptions } from '../illumination-correction'

export interface EnhanceScanOptions extends EnhanceOptions {
  /** Encoding for `image`. `'none'` keeps only the raster. Default `'png'`. */
  output?:  ImageFormat | 'none'
  /** Quality for lossy formats, 1-100. Default `92`. */
  quality?: number
}

export interface EnhanceResult {
  raster:  Raster
  /** `raster` encoded, or `null` when `output` was `'none'`. */
  image:   Uint8Array | null
  width:   number
  height:  number
  /** What was done, with any `'auto'` setting resolved to the value it chose. */
  applied: AppliedEnhancement
}

export interface EnhancePagesOptions extends EnhanceScanOptions {
  /**
   * Which image of each page to clean: `'aligned'` (the default), the scan on
   * the original's canvas, which is what OCR regions and diff boxes refer to;
   * or `'scanned'`, the scan as it came.
   */
  source?:     'aligned' | 'scanned'
  onProgress?: ProgressCallback
}

/** A page image after enhancement: a {@link PageImage}, so it can go wherever one goes. */
export interface EnhancedImage extends PageImage {
  applied: AppliedEnhancement
}

/** An aligned page with its cleaned image alongside - everything it carried is kept. */
export type EnhancedPage<Page extends AlignedPage = AlignedPage> = Page & { enhanced: EnhancedImage }

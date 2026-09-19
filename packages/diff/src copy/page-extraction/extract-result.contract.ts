import type { ImageFormat, PageImage, ProgressCallback, ScanPage } from '@scanmate/ink'

import type { PageMetadata } from '../page-inspection'
import type { DpiChoice } from '../page-rendering'
import type { PageSelection } from './page-selection.mapper'
import type { PagePairing } from './page-pairing.policy'

export interface ExtractOptions {
  /**
   * Render resolution. A number, `'native'` (a scan at its own resolution, a
   * born-digital page at `fallbackDpi`), or for pairs `'match'` (both sides at
   * the scan's resolution). Defaults: `'native'` for one document, `'match'`
   * for a pair.
   */
  dpi?:         DpiChoice
  /** Resolution for born-digital pages when the choice is `'native'` or `'match'`. Default `200`. */
  fallbackDpi?: number
  /** Floor and ceiling on a native resolution read from the file. Defaults `72` and `400`. */
  minDpi?:      number
  maxDpi?:      number
  /** Which pages, as numbers or a range string like `'1-3,5'`. For pairs, pages of the original. Default all. */
  pages?:       PageSelection
  /** Encoding of each `PageImage.image`. `'none'` keeps only rasters. Default `'png'`. */
  output?:      ImageFormat | 'none'
  /** Quality for lossy `output` formats. Default `92`. */
  quality?:     number
  /** Painted under each page, since PDF pages are transparent where nothing is drawn. Default `'white'`. */
  background?:  string
  /** Read each page's text layer into `metadata.text`. Default `true`. */
  includeText?: boolean
  /** Called before and after each page. */
  onProgress?:  ProgressCallback
}

export interface ExtractPairOptions extends ExtractOptions {
  /** How scanned pages are matched to original pages. Default `'index'`. */
  pairing?: PagePairing
}

/** One page of one document. */
export interface ExtractedPage {
  /** One-based. */
  page:     number
  image:    PageImage
  metadata: PageMetadata
}

/** A page of the original with its scanned counterpart - a `ScanPage`, plus what each PDF said about itself. */
export interface PairedPage extends ScanPage {
  /** Page number in the scanned document; differs from `page` under explicit pairing. */
  scannedPage: number
  metadata:    { original: PageMetadata, scanned: PageMetadata }
}

export interface PairedDocument {
  pages:     PairedPage[]
  /** Pages with no partner. A scan that lost a page shows up here, not as a missing array entry. */
  unpaired:  { original: number[], scanned: number[] }
  pageCount: { original: number, scanned: number }
}

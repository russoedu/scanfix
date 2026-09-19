import type { PageKind } from './page-metadata.contract'

/**
 * Coverage above which a page counts as a scan: one bitmap over the page. Scans
 * sit at or near 100%; scanners that crop to the paper edge or leave a margin
 * still clear this easily, and no letterhead gets anywhere near it.
 */
export const SCAN_COVERAGE = 0.8

export interface PageEvidence {
  /** Fraction of the page covered by painted bitmaps, in `[0, 1]`. */
  imageCoverage:  number
  characterCount: number
  /** The page draws vector paths - rules, boxes, a signature line. */
  drawsPaths:     boolean
}

/** Is this page a scan, a born-digital page, a scan with a text layer on top, or blank? */
export function classifyPage ({ imageCoverage, characterCount, drawsPaths }: PageEvidence): PageKind {
  const hasText = characterCount > 0

  if (imageCoverage >= SCAN_COVERAGE) return hasText ? 'scanned-with-text-layer' : 'scanned'
  if (hasText || drawsPaths || imageCoverage > 0) return 'vector'

  return 'empty'
}

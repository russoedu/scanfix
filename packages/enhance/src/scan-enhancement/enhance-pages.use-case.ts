import type { AlignedPage } from '@scanmate/ink'

import type { EnhancedPage, EnhancePagesOptions } from './enhance-result.contract'
import { enhanceScan } from './enhance-scan.use-case'

/**
 * The pipeline stage: every aligned page with a cleaned copy alongside.
 *
 * The cleaned image keeps the canvas and dpi of the image it came from, so
 * with the default `source: 'aligned'` it lines up with the original exactly
 * like the aligned scan does. Pages run one after another; each reports a
 * `start` and a `done` event with what `'auto'` settings resolved to.
 */
export async function enhancePages<Page extends AlignedPage> (
  pages: readonly Page[],
  options: EnhancePagesOptions = {},
): Promise<Array<EnhancedPage<Page>>> {
  const { source = 'aligned', onProgress, ...enhance } = options
  const results: Array<EnhancedPage<Page>> = []

  for (const [position, page] of pages.entries()) {
    const index = position + 1
    const started = Date.now()
    onProgress?.({ stage: 'enhance', phase: 'start', page: page.page, index, total: pages.length })

    const raster = source === 'aligned' ? page.aligned.raster : page.scanned.raster
    const dpi = source === 'aligned' ? page.original.dpi : page.scanned.dpi
    const result = await enhanceScan(raster, enhance)
    results.push({ ...page, enhanced: { ...result, dpi } })

    onProgress?.({
      stage:      'enhance',
      phase:      'done',
      page:       page.page,
      index,
      total:      pages.length,
      durationMs: Date.now() - started,
      detail:     { ...result.applied },
    })
  }

  return results
}

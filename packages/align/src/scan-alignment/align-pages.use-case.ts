import type { AlignedPage, ProgressCallback, ScanPage } from '@scanmate/ink'

import type { AlignOptions, AlignResult } from './align-result.contract'
import { alignScan } from './align-scan.use-case'

export interface AlignPagesOptions extends AlignOptions {
  /** Called before and after each page. The only logging seam - see `StageEvent` in `@scanmate/ink`. */
  onProgress?: ProgressCallback
}

/**
 * Align every page pair a document produced - typically the output of
 * `@scanmate/extract` - and hand each back with its alignment attached.
 *
 * Pages run one after another, not concurrently. The estimator is CPU-bound and
 * synchronous between decode and encode, so starting several on one thread only
 * interleaves them and makes each slower; real parallelism needs worker threads,
 * which is a decision for the caller or an orchestrator, not for a library call.
 *
 * Each page's `original` and `scanned` pass through untouched, so the result
 * still carries everything the producer knew - the dpi each side was rendered
 * at, the encoded bytes - alongside the new `aligned`.
 */
export async function alignPages (
  pages: readonly ScanPage[],
  options: AlignPagesOptions = {},
): Promise<Array<AlignedPage<AlignResult>>> {
  const { onProgress, ...alignOptions } = options
  const aligned: Array<AlignedPage<AlignResult>> = []

  for (const [position, page] of pages.entries()) {
    const index = position + 1
    onProgress?.({ stage: 'align', phase: 'start', page: page.page, index, total: pages.length })

    const result = await alignScan(page.original.raster, page.scanned.raster, alignOptions)
    aligned.push({ ...page, aligned: result })

    onProgress?.({
      stage:      'align',
      phase:      'done',
      page:       page.page,
      index,
      total:      pages.length,
      durationMs: result.diagnostics.durationMs,
      detail:     {
        confidence: result.confidence,
        model:      result.diagnostics.selectedModel,
        method:     result.method,
        attempts:   result.diagnostics.attempts.length,
      },
    })
  }

  return aligned
}

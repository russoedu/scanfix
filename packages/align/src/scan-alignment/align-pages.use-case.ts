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
 * Every page passes through untouched with `aligned` added, and the types say
 * so: whatever else the producer attached - `@scanmate/extract`'s per-page
 * `metadata`, the dpi each side was rendered at, the encoded bytes - is still
 * there, and still typed, on the way out.
 */
export async function alignPages<Page extends ScanPage> (
  pages: readonly Page[],
  options: AlignPagesOptions = {},
): Promise<Array<Page & AlignedPage<AlignResult>>> {
  const { onProgress, ...alignOptions } = options
  const aligned: Array<Page & AlignedPage<AlignResult>> = []

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

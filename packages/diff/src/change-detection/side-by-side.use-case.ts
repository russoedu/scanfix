import { createRaster } from '@scanmate/ink'
import type { Raster } from '@scanmate/ink'

import { annotateOverlay } from './annotate-overlay.use-case'
import type { Annotation, Rgba } from './annotate-overlay.use-case'

/**
 * The original and the aligned scan next to each other, with the same boxes on
 * both: what was expected, what changed, what went missing.
 *
 * The overlay answers "which pixels changed"; this answers "show me", for the
 * person who has to agree with the verdict. Because the scan is aligned onto
 * the original's canvas, a box drawn at the same place on each half surrounds
 * the same part of the page in both, so the eye goes straight from the empty
 * field on the left to the signature on the right.
 */

/** Separator between the halves: mid grey, so it shows against white paper and a grey scan alike. */
const GUTTER: Rgba = [150, 150, 150, 255]

export function composeSideBySide (original: Raster, aligned: Raster, annotations: readonly Annotation[], thickness: number, gutter: number): Raster {
  const offset = original.width + gutter
  const result = createRaster(offset + aligned.width, Math.max(original.height, aligned.height))

  paste(result, original, 0)
  paste(result, aligned, offset)
  for (let y = 0; y < result.height; y++)
    for (let x = original.width; x < offset; x++) result.data.set(GUTTER, (y * result.width + x) * 4)

  annotateOverlay(result, annotations, thickness)
  annotateOverlay(result, annotations.map(a => ({ ...a, rect: { ...a.rect, x: a.rect.x + offset } })), thickness)

  return result
}

function paste (target: Raster, source: Raster, left: number): void {
  const rowBytes = source.width * 4
  for (let y = 0; y < source.height; y++)
    target.data.set(source.data.subarray(y * rowBytes, (y + 1) * rowBytes), (y * target.width + left) * 4)
}

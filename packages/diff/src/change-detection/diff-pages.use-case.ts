import { encodeImage } from '@scanmate/ink'
import type { AlignedPage, BinaryImage, Rect } from '@scanmate/ink'

import { buildMasks, measureRegion, paintOverlay } from '../region-comparison'
import type { Masks } from '../region-comparison'
import { annotateOverlay, IDENTIFIED, NOT_IDENTIFIED, UNEXPECTED } from './annotate-overlay.use-case'
import { connectedComponents } from './connected-components.use-case'
import { mergeBoxes } from './merge-boxes.use-case'
import type { MergedBox } from './merge-boxes.use-case'
import type { Change, DiffOptions, ExpectedChange, ExpectedResult, PageDiff } from './page-diff.contract'

/**
 * What changed on each page, and whether it was supposed to.
 *
 * The overlay is the detection: the original's ink, fattened by a tolerance band,
 * subtracted from the aligned scan, leaves the ink the scan added. What this adds
 * is the reporting. What changed is grouped into changes - labelled, merged
 * across small gaps, filtered below a physical size. A change whose ink lies
 * mostly in an expected region counts toward that region, which is identified
 * once its changes add up to `minFillArea`; every other change is unexpected.
 * The same grouping is done for ink the scan lost.
 *
 * Masks are built once per page and read four ways: the overlay, the expected
 * regions, the added changes and the missing ones.
 */
export async function diffPages (
  pages: readonly AlignedPage[],
  expected: readonly ExpectedChange[] = [],
  options: DiffOptions = {},
): Promise<PageDiff[]> {
  const { onProgress } = options
  const results: PageDiff[] = []

  for (const [position, page] of pages.entries()) {
    const index = position + 1
    const started = Date.now()
    onProgress?.({ stage: 'diff', phase: 'start', page: page.page, index, total: pages.length })

    const result = await diffPage(page, expected.filter(e => e.page === page.page), options)
    results.push(result)

    onProgress?.({
      stage:      'diff',
      phase:      'done',
      page:       page.page,
      index,
      total:      pages.length,
      durationMs: Date.now() - started,
      detail:     { ...result.summary, truncated: result.truncated },
    })
  }

  return results
}

/** One page. `expected` should already be the regions for this page. */
export async function diffPage (
  page: AlignedPage,
  expected: readonly ExpectedChange[] = [],
  options: DiffOptions = {},
): Promise<PageDiff> {
  const {
    units = 'points',
    tolerance = 2,
    minFillArea = 2,
    minChangeArea = 1,
    minMissingArea = 4,
    faintInk,
    mergeGap = 3,
    assumeDpi = 150,
    regionOverlap = 0.5,
    maxChanges = 50,
    output = 'png',
    annotate = false,
    ink,
  } = options

  const dpi = page.original.dpi ?? assumeDpi
  const toPixels = units === 'points' ? dpi / 72 : 1
  const pixelsPerMm = dpi / 25.4
  const mm2PerPixel = 1 / (pixelsPerMm * pixelsPerMm)

  const masks = await buildMasks(page.original.raster, page.aligned.raster, ink, tolerance, faintInk)

  const regions = expected.map(e => ({ id: e.id, rect: scaleRect(e, toPixels) }))

  const findChanges = (mask: BinaryImage, minArea: number): MergedBox[] => {
    const components = connectedComponents(mask).filter(c => c.pixels >= 2)
    const merged = mergeBoxes(components, Math.round(mergeGap * pixelsPerMm))

    return merged
      .filter(box => box.pixels * mm2PerPixel >= minArea)
      .toSorted((a, b) => b.pixels - a.pixels)
  }

  const added = findChanges(difference(masks.scan, masks.originalDilated), minChangeArea)
  const owner = added.map(box => regions.findIndex(r => inkShareInside(box, r.rect, masks) >= regionOverlap))
  const outside = added.filter((_, i) => owner[i] === -1)
  const lost = findChanges(difference(masks.original, masks.scanDilated), minMissingArea)

  const expectedResults: ExpectedResult[] = regions.map((region, i) => {
    const addedInk = added.reduce((sum, box, b) => owner[b] === i ? sum + box.pixels * mm2PerPixel : sum, 0)
    const { removed } = measureRegion(region, masks, 0)

    return {
      id:         region.id,
      identified: addedInk >= minFillArea,
      x:          expected[i].x,
      y:          expected[i].y,
      width:      expected[i].width,
      height:     expected[i].height,
      addedInk,
      removedInk: removed * pixelArea(region.rect, masks) * mm2PerPixel,
      score:      minFillArea > 0 ? Math.min(1, addedInk / minFillArea) : 1,
    }
  })

  const truncated = outside.length > maxChanges || lost.length > maxChanges
  const toChange = (box: MergedBox): Change => ({
    x:       box.x / toPixels,
    y:       box.y / toPixels,
    width:   box.width / toPixels,
    height:  box.height / toPixels,
    inkArea: box.pixels * mm2PerPixel,
    pixels:  box.pixels,
  })
  const unexpected = outside.slice(0, maxChanges).map(box => toChange(box))
  const missing = lost.slice(0, maxChanges).map(box => toChange(box))

  const diffRaster = paintOverlay(masks)
  if (annotate)
    annotateOverlay(diffRaster, [
      ...regions.map((region, i) => ({
        rect:  grow(region.rect, 2),
        color: expectedResults[i].identified ? IDENTIFIED : NOT_IDENTIFIED,
      })),
      ...outside.slice(0, maxChanges).map(box => ({ rect: grow(box, 4), color: UNEXPECTED })),
    ])

  const whole = measureRegion({ id: '__page__', rect: { x: 0, y: 0, width: masks.width, height: masks.height } }, masks, 0)
  const identified = expectedResults.filter(r => r.identified).length

  return {
    page:      page.page,
    diffRaster,
    diffImage: output === 'none' ? null : await encodeImage(diffRaster, { format: output }),
    expected:  expectedResults,
    unexpected,
    missing,
    truncated,
    summary:   {
      addedInk:      whole.added,
      removedInk:    whole.removed,
      identified,
      notIdentified: expectedResults.length - identified,
      unexpected:    unexpected.length,
      missing:       missing.length,
    },
  }
}

/** Set where `a` is set and `b` is not. */
function difference (a: BinaryImage, b: BinaryImage): BinaryImage {
  const data = new Uint8Array(a.data.length)
  for (let p = 0; p < data.length; p++) data[p] = a.data[p] === 1 && b.data[p] === 0 ? 1 : 0

  return { width: a.width, height: a.height, data }
}

/**
 * Share of a change's new ink that falls inside a region.
 *
 * Measured on ink, not on box area: a signature that overflows its box by a
 * flourish is still mostly inside it, while its bounding box may not be.
 */
function inkShareInside (box: MergedBox, region: Rect, masks: Masks): number {
  const left = Math.max(box.x, Math.floor(region.x))
  const top = Math.max(box.y, Math.floor(region.y))
  const right = Math.min(box.x + box.width, Math.ceil(region.x + region.width))
  const bottom = Math.min(box.y + box.height, Math.ceil(region.y + region.height))
  if (right <= left || bottom <= top) return 0

  let inside = 0
  for (let y = top; y < bottom; y++) {
    const row = y * masks.width
    for (let x = left; x < right; x++)
      if (masks.scan.data[row + x] === 1 && masks.originalDilated.data[row + x] === 0) inside++
  }

  // The count here includes isolated pixels the component filter dropped from
  // box.pixels, so it can nudge past one.
  return box.pixels > 0 ? Math.min(1, inside / box.pixels) : 0
}

/** Pixels of a region that lie on the page - what `measureRegion`'s shares are shares of. */
function pixelArea (rect: Rect, masks: Masks): number {
  const width = Math.min(masks.width, Math.ceil(rect.x + rect.width)) - Math.max(0, Math.floor(rect.x))
  const height = Math.min(masks.height, Math.ceil(rect.y + rect.height)) - Math.max(0, Math.floor(rect.y))

  return Math.max(0, width) * Math.max(0, height)
}

function scaleRect (rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, width: rect.width * factor, height: rect.height * factor }
}

function grow (rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by }
}

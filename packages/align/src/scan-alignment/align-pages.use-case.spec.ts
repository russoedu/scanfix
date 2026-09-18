import { createSyntheticDocument, simulateScan } from '@scanmate/ink'
import type { PageImage, Raster, ScanPage, StageEvent } from '@scanmate/ink'

import { alignPages } from './align-pages.use-case'

function side (raster: Raster, dpi: number | null): PageImage {
  return { raster, image: null, width: raster.width, height: raster.height, dpi }
}

function pair (page: number, seed: number): ScanPage {
  const original = createSyntheticDocument({ width: 360, height: 460, seed })
  const scan = simulateScan(original.raster, { rotationDeg: 1.5, scale: 1.2, seed })

  return { page, original: side(original.raster, 150), scanned: side(scan.raster, 180) }
}

describe('alignPages', () => {
  it('aligns every page onto its own original, keeping page numbers and order', async () => {
    const pages = [pair(1, 3), pair(2, 7)]
    const aligned = await alignPages(pages, { output: 'none' })

    expect(aligned.map(p => p.page)).toEqual([1, 2])
    for (const [i, page] of aligned.entries()) {
      expect(page.aligned.width).toBe(pages[i].original.width)
      expect(page.aligned.height).toBe(pages[i].original.height)
      expect(page.aligned.confidence).toBeGreaterThan(0.6)
    }
  }, 90_000)

  it('passes both sides through untouched, alongside the alignment', async () => {
    const [page] = [pair(4, 5)]
    const [aligned] = await alignPages([page], { output: 'none' })

    expect(aligned.original).toBe(page.original)
    expect(aligned.scanned).toBe(page.scanned)
    expect(aligned.scanned.dpi).toBe(180)
  }, 45_000)

  it('reports a start and a done event for each page, in order', async () => {
    const events: StageEvent[] = []
    await alignPages([pair(1, 3), pair(2, 7)], { output: 'none', onProgress: e => { events.push(e) } })

    expect(events.map(e => `${e.phase}:${e.page}:${e.index}/${e.total}`))
      .toEqual(['start:1:1/2', 'done:1:1/2', 'start:2:2/2', 'done:2:2/2'])
    expect(events.every(e => e.stage === 'align')).toBe(true)

    const done = events.filter(e => e.phase === 'done')
    for (const event of done) {
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
      expect(event.detail).toMatchObject({ method: 'features' })
    }
  }, 90_000)

  it('returns nothing for nothing, and reports nothing', async () => {
    const events: StageEvent[] = []

    expect(await alignPages([], { onProgress: e => { events.push(e) } })).toEqual([])
    expect(events).toEqual([])
  })

  it('passes alignment options through to every page', async () => {
    const [aligned] = await alignPages([pair(1, 3)], { output: 'none', model: 'affine' })

    expect(aligned.aligned.diagnostics.selectedModel).toBe('affine')
    expect(aligned.aligned.image).toBeNull()
  }, 45_000)
})

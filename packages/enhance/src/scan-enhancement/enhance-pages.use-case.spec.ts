import { createRaster, decodeImage, IDENTITY } from '@scanmate/ink'
import type { AlignedPage, Raster, StageEvent } from '@scanmate/ink'

import { enhancePages } from './enhance-pages.use-case'
import { enhanceScan } from './enhance-scan.use-case'

function page (number: number, aligned: Raster, scanned: Raster): AlignedPage & { note: string } {
  const side = (raster: Raster, dpi: number) => ({ raster, image: null, width: raster.width, height: raster.height, dpi })

  return {
    page:     number,
    original: side(createRaster(40, 30), 150),
    scanned:  side(scanned, 96),
    aligned:  { raster: aligned, image: null, width: aligned.width, height: aligned.height, matrix: IDENTITY, inverse: IDENTITY, confidence: 0.95 },
    note:     'kept',
  }
}

describe('enhanceScan', () => {
  it('encodes the result as PNG by default', async () => {
    const result = await enhanceScan(createRaster(8, 8, [120, 120, 120, 255]))
    const decoded = await decodeImage(result.image!)

    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 8, height: 8 })
  })

  it('skips encoding when asked', async () => {
    const result = await enhanceScan(createRaster(8, 8, [120, 120, 120, 255]), { output: 'none' })

    expect(result.image).toBeNull()
    expect(result.raster.width).toBe(8)
  })
})

describe('enhancePages', () => {
  it('cleans the aligned scan, keeps its canvas and dpi, and keeps everything else the page carried', async () => {
    const [enhanced] = await enhancePages([page(3, createRaster(40, 30, [150, 150, 150, 255]), createRaster(20, 15))], { output: 'none' })

    expect(enhanced).toMatchObject({ page: 3, note: 'kept' })
    expect(enhanced.enhanced).toMatchObject({ width: 40, height: 30, dpi: 150, image: null })
    // Grey paper comes back white.
    expect(enhanced.enhanced.raster.data[0]).toBe(255)
  })

  it('cleans the scan as it came when asked', async () => {
    const [enhanced] = await enhancePages([page(1, createRaster(40, 30), createRaster(20, 15))], { output: 'none', source: 'scanned' })

    expect(enhanced.enhanced).toMatchObject({ width: 20, height: 15, dpi: 96 })
  })

  it('reports a start and a done event per page, with what was applied', async () => {
    const events: StageEvent[] = []
    await enhancePages([page(1, createRaster(40, 30), createRaster(20, 15)), page(2, createRaster(40, 30), createRaster(20, 15))], {
      output:     'none',
      onProgress: e => { events.push(e) },
    })

    expect(events.map(e => `${e.stage}:${e.phase}:${e.page}`)).toEqual(['enhance:start:1', 'enhance:done:1', 'enhance:start:2', 'enhance:done:2'])
    expect(events[1].detail).toMatchObject({ mode: 'color', despeckled: false })
  })
})

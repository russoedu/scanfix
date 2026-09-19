import { alignPages } from '@scanmate/align'
import { createSyntheticDocument, simulateScan } from '@scanmate/ink'
import type { Raster, StageEvent } from '@scanmate/ink'

import { A4, createSyntheticPdf } from '../synthetic-pdf'
import type { SyntheticPdfPage } from '../synthetic-pdf'
import { extractPair } from './extract-pair.use-case'
import { extractPages } from './extract-pages.use-case'

/** A born-digital form: enough text and rules for features to find. */
const FORM: SyntheticPdfPage = {
  text: [
    { x: 72, y: 780, size: 20, content: 'ORDER CONFIRMATION FORM' },
    ...Array.from({ length: 16 }, (_, i) => ({ x: 72, y: 730 - i * 38, size: 13, content: `Line ${i + 1}: Customer details and commercial terms` })),
  ],
  lines: Array.from({ length: 8 }, (_, i) => ({ x1: 72, y1: 120 + i * 60, x2: 523, y2: 120 + i * 60 })),
}

/** A page painted with one full-page bitmap: how a scan arrives as a PDF. */
function scanPage (raster: Raster): SyntheticPdfPage {
  return { images: [{ raster, x: 0, y: 0, width: A4.width, height: A4.height }] }
}

const SCAN_100_DPI = scanPage(createSyntheticDocument({ width: 827, height: 1169, seed: 6 }).raster)

describe('extractPair', () => {
  it("renders both sides at the scan's resolution, so they are directly comparable", async () => {
    const { pages } = await extractPair({
      original: await createSyntheticPdf([FORM]),
      scanned:  await createSyntheticPdf([SCAN_100_DPI]),
    }, { output: 'none' })

    const [pair] = pages
    expect(pair.original.dpi).toBe(100)
    expect(pair.scanned.dpi).toBe(100)
    expect(Math.abs(pair.original.width - pair.scanned.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(pair.original.height - pair.scanned.height)).toBeLessThanOrEqual(1)
    expect(pair.metadata.original.kind).toBe('vector')
    expect(pair.metadata.scanned.kind).toBe('scanned')
  }, 30_000)

  it('reports a page the scan lost, instead of pairing around it', async () => {
    const result = await extractPair({
      original: await createSyntheticPdf([FORM, FORM, FORM]),
      scanned:  await createSyntheticPdf([SCAN_100_DPI, SCAN_100_DPI]),
    }, { output: 'none', dpi: 36 })

    expect(result.pages.map(p => p.page)).toEqual([1, 2])
    expect(result.unpaired).toEqual({ original: [3], scanned: [] })
    expect(result.pageCount).toEqual({ original: 3, scanned: 2 })
  }, 30_000)

  it('follows explicit pairing past a cover sheet', async () => {
    const result = await extractPair({
      original: await createSyntheticPdf([FORM]),
      scanned:  await createSyntheticPdf([{}, SCAN_100_DPI]),
    }, { output: 'none', dpi: 36, pairing: [[1, 2]] })

    expect(result.pages.map(p => [p.page, p.scannedPage])).toEqual([[1, 2]])
    expect(result.unpaired).toEqual({ original: [], scanned: [1] })
  }, 30_000)

  it('extracts only the original pages asked for', async () => {
    const result = await extractPair({
      original: await createSyntheticPdf([FORM, FORM, FORM]),
      scanned:  await createSyntheticPdf([FORM, FORM, FORM]),
    }, { output: 'none', dpi: 36, pages: [2] })

    expect(result.pages.map(p => p.page)).toEqual([2])
    // Pages not asked for are not "unpaired": they have partners, they were just not wanted.
    expect(result.unpaired).toEqual({ original: [], scanned: [] })
  })

  it('reports one start and one done event per pair', async () => {
    const events: StageEvent[] = []
    await extractPair({
      original: await createSyntheticPdf([FORM, FORM]),
      scanned:  await createSyntheticPdf([FORM, FORM]),
    }, { output: 'none', dpi: 36, onProgress: e => { events.push(e) } })

    expect(events.map(e => `${e.phase}:${e.index}/${e.total}`)).toEqual(['start:1/2', 'done:1/2', 'start:2/2', 'done:2/2'])
  })

  it('feeds @scanmate/align directly: a crooked scan of the printed page comes back into line', async () => {
    // Print the form at 100 dpi, scan it crooked and noisy, and put that scan into
    // a PDF the way a scanner would. Then run the pipeline as a caller would.
    const [printed] = await extractPages(await createSyntheticPdf([FORM]), { dpi: 100, output: 'none' })
    const scan = simulateScan(printed.image.raster, { rotationDeg: 2.5, noise: 0.01, blur: 0.6, seed: 11 })

    const { pages } = await extractPair({
      original: await createSyntheticPdf([FORM]),
      scanned:  await createSyntheticPdf([scanPage(scan.raster)]),
    }, { output: 'none' })
    const [aligned] = await alignPages(pages, { output: 'none' })

    expect(pages[0].scanned.dpi).toBe(100)
    expect(aligned.aligned.method).toBe('features')
    expect(aligned.aligned.confidence).toBeGreaterThan(0.8)
    expect(Math.abs(Math.abs(aligned.aligned.transform.rotationDeg) - 2.5)).toBeLessThan(0.3)
    expect(aligned.aligned.width).toBe(pages[0].original.width)
  }, 120_000)
})

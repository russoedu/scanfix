import { createRaster, createSyntheticDocument } from '@scanmate/ink'

import { openPdf } from '../pdf-document'
import { A4, createSyntheticPdf } from '../synthetic-pdf'
import type { SyntheticPdfPage } from '../synthetic-pdf'
import { inspectPage } from './inspect-page.use-case'

/** A4 at 100 dpi: 8.27 x 11.69 inches. */
const SCAN = createSyntheticDocument({ width: 827, height: 1169, seed: 2 }).raster
const LOGO = createRaster(60, 30, [20, 60, 140, 255])

async function inspect (page: SyntheticPdfPage) {
  const opened = await openPdf(await createSyntheticPdf([page]))
  try {
    return await inspectPage(await opened.document.getPage(1))
  } finally {
    await opened.close()
  }
}

describe('inspectPage', () => {
  it('reads a born-digital page: its size, its text, and no scan', async () => {
    const meta = await inspect({
      text: [{ x: 72, y: 760, content: 'ORDER CONFIRMATION' }, { x: 72, y: 740, content: 'Customer Details' }],
    })

    expect(meta.kind).toBe('vector')
    expect(meta.pointWidth).toBeCloseTo(A4.width, 1)
    expect(meta.pointHeight).toBeCloseTo(A4.height, 1)
    expect(meta.text).toContain('ORDER CONFIRMATION')
    expect(meta.text).toContain('Customer Details')
    expect(meta.hasTextLayer).toBe(true)
    expect(meta.embeddedImages).toEqual([])
    expect(meta.effectiveDpi).toBeNull()
  })

  it('reads a scanned page: one bitmap over the page, and the resolution it was scanned at', async () => {
    const meta = await inspect({ images: [{ raster: SCAN, x: 0, y: 0, width: A4.width, height: A4.height }] })

    expect(meta.kind).toBe('scanned')
    expect(meta.imageCoverage).toBeCloseTo(1, 3)
    expect(meta.text).toBeNull()
    expect(meta.embeddedImages).toHaveLength(1)
    expect(meta.embeddedImages[0]).toMatchObject({ width: 827, height: 1169 })
    expect(meta.effectiveDpi).toBe(100)
  }, 30_000)

  it('does not mistake a letterhead logo for a scan', async () => {
    // Every page of a real order form carried a logo; it covered 1.2% of the page.
    const meta = await inspect({
      text:   [{ x: 72, y: 700, content: 'Terms and conditions apply' }],
      images: [{ raster: LOGO, x: 36, y: 780, width: 120, height: 40 }],
    })

    expect(meta.kind).toBe('vector')
    expect(meta.imageCoverage).toBeLessThan(0.02)
    expect(meta.embeddedImages).toHaveLength(1)
    expect(meta.effectiveDpi).toBeNull()
  })

  it('recognises a scan that carries an invisible OCR text layer', async () => {
    const meta = await inspect({
      images: [{ raster: SCAN, x: 0, y: 0, width: A4.width, height: A4.height }],
      text:   [{ x: 72, y: 760, content: 'recognised by the scanner', invisible: true }],
    })

    expect(meta.kind).toBe('scanned-with-text-layer')
    expect(meta.text).toContain('recognised by the scanner')
    expect(meta.effectiveDpi).toBe(100)
  }, 30_000)

  it('calls a page of ruled lines and no text vector, not empty', async () => {
    const meta = await inspect({ lines: [{ x1: 72, y1: 100, x2: 520, y2: 100 }] })

    expect(meta.kind).toBe('vector')
    expect(meta.text).toBeNull()
  })

  it('calls a page with nothing on it empty', async () => {
    const meta = await inspect({})

    expect(meta.kind).toBe('empty')
  })

  it('reports the rotation a page asks to be shown at', async () => {
    const meta = await inspect({ rotate: 90, text: [{ x: 72, y: 700, content: 'sideways' }] })

    expect(meta.rotation).toBe(90)
    // Size is reported unrotated, as the MediaBox gives it.
    expect(meta.pointWidth).toBeCloseTo(A4.width, 1)
  })

  it('measures an anamorphic scan by the mean of its two resolutions', async () => {
    // 100 dpi across, 200 dpi down: one render scale has to serve both axes.
    const tall = createRaster(827, 2338)
    const meta = await inspect({ images: [{ raster: tall, x: 0, y: 0, width: A4.width, height: A4.height }] })

    expect(meta.embeddedImages[0].dpiX).toBeCloseTo(100, 0)
    expect(meta.embeddedImages[0].dpiY).toBeCloseTo(200, 0)
    expect(meta.effectiveDpi).toBe(141)
  }, 30_000)
})

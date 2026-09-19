import { alignScan } from '@scanmate/align'
import { cloneRaster, createSyntheticDocument, decodeImage, drawSignature, drawTick, fillRect, IDENTITY, simulateScan } from '@scanmate/ink'
import type { AlignedPage, Raster, Rect, StageEvent } from '@scanmate/ink'

import { IDENTIFIED, NOT_IDENTIFIED, UNEXPECTED } from './annotate-overlay.use-case'
import { diffPage, diffPages } from './diff-pages.use-case'
import type { ExpectedChange } from './page-diff.contract'

const FORM = createSyntheticDocument({ width: 600, height: 780, seed: 5 })
const SIGNATURE = FORM.regions.signature
const TICK = FORM.regions['tick-1']

/**
 * A page already on the original's canvas. At 72 dpi one point is one pixel,
 * which keeps the rectangles in these tests readable; units have their own test.
 */
function page (aligned: Raster, dpi = 72, number = 1): AlignedPage {
  const side = { raster: FORM.raster, image: null, width: FORM.raster.width, height: FORM.raster.height, dpi }

  return {
    page:     number,
    original: side,
    scanned:  { ...side, raster: aligned },
    aligned:  { raster: aligned, image: null, width: aligned.width, height: aligned.height, matrix: IDENTITY, inverse: IDENTITY, confidence: 1 },
  }
}

function expect_ (id: string, rect: Rect, pageNumber = 1): ExpectedChange {
  return { page: pageNumber, id, ...rect }
}

function signed (): Raster {
  const raster = cloneRaster(FORM.raster)
  drawSignature(raster, SIGNATURE, 4)

  return raster
}

function hasColour (raster: Raster, color: readonly number[]): boolean {
  for (let i = 0; i < raster.data.length; i += 4)
    if (raster.data[i] === color[0] && raster.data[i + 1] === color[1] && raster.data[i + 2] === color[2]) return true

  return false
}

describe('diffPage', () => {
  it('reports nothing on an unchanged page', async () => {
    const diff = await diffPage(page(cloneRaster(FORM.raster)), [], { output: 'none' })

    expect(diff.unexpected).toEqual([])
    expect(diff.missing).toEqual([])
    expect(diff.summary.addedInk).toBe(0)
  })

  it('identifies a signature where one was expected, and calls nothing unexpected', async () => {
    const diff = await diffPage(page(signed()), [expect_('signature', SIGNATURE)], { output: 'none' })

    expect(diff.expected).toEqual([expect.objectContaining({ id: 'signature', identified: true })])
    expect(diff.unexpected).toEqual([])
  })

  it('does not identify an expected region that was left empty', async () => {
    const diff = await diffPage(page(signed()), [expect_('signature', SIGNATURE), expect_('tick', TICK)], { output: 'none' })

    expect(diff.expected.map(e => [e.id, e.identified])).toEqual([['signature', true], ['tick', false]])
    expect(diff.summary).toMatchObject({ identified: 1, notIdentified: 1 })
  })

  it('reports a mark nobody expected as one merged box, where it was made', async () => {
    const diff = await diffPage(page(signed()), [], { output: 'none' })

    expect(diff.unexpected).toHaveLength(1)
    const [change] = diff.unexpected
    expect(change.x).toBeGreaterThanOrEqual(SIGNATURE.x - 2)
    expect(change.x + change.width).toBeLessThanOrEqual(SIGNATURE.x + SIGNATURE.width + 2)
    expect(change.inkArea).toBeGreaterThan(1)
  })

  it('keeps an expected mark and an unexpected one apart', async () => {
    const raster = signed()
    drawTick(raster, TICK)
    const diff = await diffPage(page(raster), [expect_('signature', SIGNATURE)], { output: 'none' })

    expect(diff.expected[0].identified).toBe(true)
    expect(diff.unexpected).toHaveLength(1)
    expect(diff.unexpected[0].x).toBeGreaterThanOrEqual(TICK.x - 2)
  })

  it('ignores specks smaller than the smallest change worth reporting', async () => {
    const raster = cloneRaster(FORM.raster)
    // A 2x2 px speck at 72 dpi is about 0.5 mm2: dust, not a mark.
    fillRect(raster, { x: 300, y: 700, width: 2, height: 2 }, 0)
    const diff = await diffPage(page(raster), [], { output: 'none' })

    expect(diff.unexpected).toEqual([])
  })

  it('reports ink the scan lost', async () => {
    const raster = cloneRaster(FORM.raster)
    // White out a band of printed lines: a dropped paragraph.
    fillRect(raster, { x: 40, y: 120, width: 520, height: 60 }, 255)
    const diff = await diffPage(page(raster), [], { output: 'none' })

    expect(diff.missing.length).toBeGreaterThan(0)
    expect(diff.missing[0].inkArea).toBeGreaterThan(4)
    expect(diff.summary.removedInk).toBeGreaterThan(0)
  })

  it('does not call faded ink missing: lighter is not gone', async () => {
    // Wash the whole scan halfway towards white, as a scanner washes out colour.
    const faded = cloneRaster(FORM.raster)
    for (let i = 0; i < faded.data.length; i += 4)
      for (let c = 0; c < 3; c++) faded.data[i + c] = Math.round(faded.data[i + c] + (255 - faded.data[i + c]) * 0.55)
    const diff = await diffPage(page(faded), [], { output: 'none' })

    expect(diff.missing).toEqual([])
  })

  it('takes and reports rectangles in PDF points, converting through the page dpi', async () => {
    // At 144 dpi a point is two pixels: the signature box in points is half its pixel size.
    // The stray tick goes in the stamp box, far from the signature: at 144 dpi this
    // small form is physically half size, and tick-1 would fall inside the 3 mm merge gap.
    const inPoints = { x: SIGNATURE.x / 2, y: SIGNATURE.y / 2, width: SIGNATURE.width / 2, height: SIGNATURE.height / 2 }
    const stray = FORM.regions.stamp
    const raster = signed()
    drawTick(raster, stray)
    const diff = await diffPage(page(raster, 144), [expect_('signature', inPoints)], { output: 'none' })

    expect(diff.expected[0].identified).toBe(true)
    expect(diff.expected[0].x).toBe(inPoints.x)
    expect(diff.unexpected).toHaveLength(1)
    expect(Math.abs(diff.unexpected[0].x - stray.x / 2)).toBeLessThan(stray.width / 2)
  })

  it('takes rectangles in pixels when asked', async () => {
    const diff = await diffPage(page(signed(), 144), [expect_('signature', SIGNATURE)], { output: 'none', units: 'pixels' })

    expect(diff.expected[0].identified).toBe(true)
  })

  it('says a page was truncated rather than listing every fragment', async () => {
    const raster = cloneRaster(FORM.raster)
    for (let i = 0; i < 12; i++) fillRect(raster, { x: 40 + i * 45, y: 740, width: 20, height: 20 }, 0)
    const diff = await diffPage(page(raster), [], { output: 'none', maxChanges: 5 })

    expect(diff.truncated).toBe(true)
    expect(diff.unexpected).toHaveLength(5)
  })

  it('draws the report onto the overlay when asked to annotate', async () => {
    const raster = signed()
    drawTick(raster, TICK)
    const expected = [expect_('signature', SIGNATURE), expect_('stamp', FORM.regions.stamp)]
    const plain = await diffPage(page(raster), expected, { output: 'none' })
    const annotated = await diffPage(page(raster), expected, { output: 'none', annotate: true })

    expect(hasColour(plain.diffRaster, IDENTIFIED)).toBe(false)
    expect(hasColour(annotated.diffRaster, IDENTIFIED)).toBe(true)
    expect(hasColour(annotated.diffRaster, NOT_IDENTIFIED)).toBe(true)
    expect(hasColour(annotated.diffRaster, UNEXPECTED)).toBe(true)
  })

  it('encodes the overlay as PNG by default', async () => {
    const diff = await diffPage(page(signed()))
    const decoded = await decodeImage(diff.diffImage!)

    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: FORM.raster.width, height: FORM.raster.height })
  })
})

describe('diffPages', () => {
  it('gives each page only its own expected regions, and reports progress per page', async () => {
    const events: StageEvent[] = []
    const diffs = await diffPages(
      [page(signed(), 72, 1), page(cloneRaster(FORM.raster), 72, 2)],
      [expect_('signature', SIGNATURE, 1), expect_('witness', SIGNATURE, 2)],
      { output: 'none', onProgress: e => { events.push(e) } },
    )

    expect(diffs.map(d => d.expected.map(e => [e.id, e.identified]))).toEqual([[['signature', true]], [['witness', false]]])
    expect(events.map(e => `${e.stage}:${e.phase}:${e.page}`)).toEqual(['diff:start:1', 'diff:done:1', 'diff:start:2', 'diff:done:2'])
  })

  it('works end to end on a crooked, noisy scan that align has put back in place', async () => {
    const scan = simulateScan(signed(), { rotationDeg: -2.2, scale: 1.3, noise: 0.01, blur: 0.8, illumination: 0.2, seed: 8 })
    const aligned = await alignScan(FORM.raster, scan.raster, { output: 'none' })
    const side = { raster: FORM.raster, image: null, width: FORM.raster.width, height: FORM.raster.height, dpi: 72 }
    const [diff] = await diffPages(
      [{ page: 1, original: side, scanned: { ...side, raster: scan.raster }, aligned }],
      [expect_('signature', SIGNATURE), expect_('tick', TICK)],
      { output: 'none' },
    )

    expect(diff.expected.map(e => [e.id, e.identified])).toEqual([['signature', true], ['tick', false]])
    expect(diff.unexpected).toEqual([])
    // This scan's blur washes the form's 1-pixel rules down to 5% ink - below
    // the faint threshold and at the ink map's own noise floor - so a hairline
    // really is gone from the image, and missing says so. Nothing thicker is.
    for (const lost of diff.missing) expect(Math.min(lost.width, lost.height)).toBeLessThanOrEqual(2)
  }, 60_000)
})

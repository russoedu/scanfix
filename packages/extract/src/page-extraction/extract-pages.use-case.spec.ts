import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSyntheticDocument, decodeImage } from '@scanmate/ink'
import type { StageEvent } from '@scanmate/ink'

import { A4, createSyntheticPdf } from '../synthetic-pdf'
import type { SyntheticPdfPage } from '../synthetic-pdf'
import { extractPages, extractPageStream } from './extract-pages.use-case'

const PRINTED: SyntheticPdfPage = {
  text:  [{ x: 72, y: 760, size: 18, content: 'ORDER CONFIRMATION' }, { x: 72, y: 720, content: 'Company Name' }],
  lines: [{ x1: 72, y1: 700, x2: 520, y2: 700 }],
}
/** A4 at 100 dpi, painted over the whole page: a scan. */
const SCANNED: SyntheticPdfPage = {
  images: [{ raster: createSyntheticDocument({ width: 827, height: 1169, seed: 4 }).raster, x: 0, y: 0, width: A4.width, height: A4.height }],
}

describe('extractPages', () => {
  it('renders at a fixed resolution when given one', async () => {
    const [page] = await extractPages(await createSyntheticPdf([PRINTED]), { dpi: 72, output: 'none' })

    expect({ width: page.image.width, height: page.image.height, dpi: page.image.dpi })
      .toEqual({ width: 596, height: 842, dpi: 72 })
  })

  it('renders a scanned page at the resolution it was scanned at', async () => {
    const [page] = await extractPages(await createSyntheticPdf([SCANNED]), { output: 'none' })

    expect(page.image.dpi).toBe(100)
    expect(Math.abs(page.image.width - 827)).toBeLessThanOrEqual(1)
    expect(Math.abs(page.image.height - 1169)).toBeLessThanOrEqual(1)
  }, 30_000)

  it('renders a born-digital page at the fallback resolution when asked for its native one', async () => {
    const [page] = await extractPages(await createSyntheticPdf([PRINTED]), { output: 'none', fallbackDpi: 100 })

    expect(page.image.dpi).toBe(100)
    expect(page.metadata.kind).toBe('vector')
  })

  it('actually draws the page: text and rules leave ink on white paper', async () => {
    const [page] = await extractPages(await createSyntheticPdf([PRINTED]), { dpi: 100, output: 'none' })
    const { data } = page.image.raster
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] < 100) dark++

    expect(data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
    expect(dark).toBeGreaterThan(500)
  })

  it('applies the rotation a page asks for', async () => {
    const [page] = await extractPages(await createSyntheticPdf([{ ...PRINTED, rotate: 90 }]), { dpi: 72, output: 'none' })

    expect(page.image.width).toBeGreaterThan(page.image.height)
  })

  it('extracts only the pages asked for, keeping their numbers', async () => {
    const pdf = await createSyntheticPdf([PRINTED, PRINTED, PRINTED])
    const pages = await extractPages(pdf, { dpi: 36, output: 'none', pages: '2-3' })

    expect(pages.map(p => p.page)).toEqual([2, 3])
  })

  it('encodes each page as PNG by default, and skips encoding when asked', async () => {
    const pdf = await createSyntheticPdf([PRINTED])
    const [encoded] = await extractPages(pdf, { dpi: 36 })
    const [bare] = await extractPages(pdf, { dpi: 36, output: 'none' })

    expect(encoded.image.image).not.toBeNull()
    const decoded = await decodeImage(encoded.image.image!)
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: encoded.image.width, height: encoded.image.height })
    expect(bare.image.image).toBeNull()
  })

  it("leaves the caller's bytes intact, although pdf.js detaches what it is given", async () => {
    const bytes = await createSyntheticPdf([PRINTED])
    const length = bytes.byteLength
    await extractPages(bytes, { dpi: 36, output: 'none' })

    expect(bytes.byteLength).toBe(length)
    const again = await extractPages(bytes, { dpi: 36, output: 'none' })
    expect(again).toHaveLength(1)
  })

  it('accepts a path, a file URL and an ArrayBuffer as readily as bytes', async () => {
    const bytes = await createSyntheticPdf([PRINTED])
    const directory = await mkdtemp(join(tmpdir(), 'extract-'))
    const file = join(directory, 'page.pdf')
    await writeFile(file, bytes)
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)

    for (const input of [file, pathToFileURL(file), buffer]) {
      const pages = await extractPages(input, { dpi: 36, output: 'none' })
      expect(pages[0].metadata.text).toContain('ORDER CONFIRMATION')
    }
  })

  it('leaves the text out when asked', async () => {
    const [page] = await extractPages(await createSyntheticPdf([PRINTED]), { dpi: 36, output: 'none', includeText: false })

    expect(page.metadata.text).toBeNull()
    expect(page.metadata.kind).toBe('vector')
  })

  it('reports a start and a done event per page', async () => {
    const events: StageEvent[] = []
    await extractPages(await createSyntheticPdf([PRINTED, PRINTED]), {
      dpi: 36, output: 'none', onProgress: e => { events.push(e) },
    })

    expect(events.map(e => `${e.stage}:${e.phase}:${e.page}:${e.index}/${e.total}`))
      .toEqual(['extract:start:1:1/2', 'extract:done:1:1/2', 'extract:start:2:2/2', 'extract:done:2:2/2'])
    expect(events[1].detail).toMatchObject({ kind: 'vector', dpi: 36 })
  })

  it('streams: stopping after one page renders nothing more and still closes the document', async () => {
    const events: StageEvent[] = []
    const stream = extractPageStream(await createSyntheticPdf([PRINTED, PRINTED, PRINTED]), {
      dpi: 36, output: 'none', onProgress: e => { events.push(e) },
    })
    for await (const page of stream) {
      expect(page.page).toBe(1)
      break
    }

    expect(events.filter(e => e.phase === 'start')).toHaveLength(1)
  })

  it('renders when the host process already put a Path2D from another canvas module in scope', async () => {
    // pdf.js fills the global Path2D once, from whichever copy loads first. One
    // from a foreign module - here, a class with no drawing methods at all -
    // must neither be used for this render nor be lost from the host after it.
    const scope = globalThis as { Path2D?: unknown }
    const host = scope.Path2D
    class ForeignPath2D {}
    scope.Path2D = ForeignPath2D
    try {
      const [page] = await extractPages(await createSyntheticPdf([PRINTED]), { dpi: 72, output: 'none' })

      expect(page.image.width).toBe(596)
      expect(scope.Path2D).toBe(ForeignPath2D)
    } finally {
      scope.Path2D = host
    }
  })

  it('refuses an empty input rather than hand it to pdf.js', async () => {
    await expect(extractPages(new Uint8Array(0))).rejects.toThrow(/empty PDF/)
  })
})

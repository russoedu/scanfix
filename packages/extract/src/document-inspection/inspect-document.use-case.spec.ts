import { A4, createSyntheticPdf } from '../synthetic-pdf'
import { inspectDocument } from './inspect-document.use-case'

const LETTER = { width: 612, height: 792 }
const TEXT = [{ x: 72, y: 700, content: 'Signature' }]

describe('inspectDocument', () => {
  it('reads every page size and rotation without rendering', async () => {
    const pdf = await createSyntheticPdf([{ text: TEXT }, { rotate: 90, text: TEXT }, { ...LETTER, text: TEXT }])
    const inspection = await inspectDocument(pdf)

    expect(inspection.pageCount).toBe(3)
    expect(inspection.byteLength).toBe(pdf.byteLength)
    expect(inspection.pages.map(p => [p.page, Math.round(p.pointWidth), Math.round(p.pointHeight), p.rotation]))
      .toEqual([[1, 595, 842, 0], [2, 595, 842, 90], [3, 612, 792, 0]])
    // A quarter turn swaps the displayed sides.
    expect(inspection.pages[1]).toMatchObject({ displayWidth: A4.height, displayHeight: A4.width })
    expect(inspection.pages.every(p => p.metadata === null)).toBe(true)
    expect(inspection.info.pdfVersion).toMatch(/^\d\.\d$/)
  })

  it('inspects only the pages asked for, and still counts them all', async () => {
    const inspection = await inspectDocument(await createSyntheticPdf([{}, {}, {}, {}]), { pages: '2-3' })

    expect(inspection.pageCount).toBe(4)
    expect(inspection.pages.map(p => p.page)).toEqual([2, 3])
  })

  it('adds each page’s full metadata when asked', async () => {
    const inspection = await inspectDocument(await createSyntheticPdf([{ text: TEXT }]), { metadata: true })
    const [page] = inspection.pages

    expect(page.metadata).toMatchObject({ kind: 'vector', hasTextLayer: true })
    expect(page.metadata?.textItems.map(i => i.text)).toEqual(['Signature'])
  })

  it('fails fast on something that is not a PDF', async () => {
    await expect(inspectDocument(new TextEncoder().encode('not a pdf'))).rejects.toThrow()
    await expect(inspectDocument(new Uint8Array(0))).rejects.toThrow(/empty PDF/)
  })
})

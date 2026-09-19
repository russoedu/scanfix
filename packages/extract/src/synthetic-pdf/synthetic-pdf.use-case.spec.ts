import { createRaster } from '@scanmate/ink'

import { openPdf } from '../pdf-document'
import { A4, createSyntheticPdf } from './synthetic-pdf.use-case'

describe('createSyntheticPdf', () => {
  it('writes a PDF that pdf.js opens, with every page it was given', async () => {
    const bytes = await createSyntheticPdf([
      { text: [{ x: 72, y: 700, content: 'one' }] },
      { width: 612, height: 792, text: [{ x: 72, y: 700, content: 'two' }] },
    ])
    const opened = await openPdf(bytes)
    try {
      expect(opened.document.numPages).toBe(2)
      const second = await opened.document.getPage(2)
      expect(second.view).toEqual([0, 0, 612, 792])
    } finally {
      await opened.close()
    }
  })

  it('starts with a PDF header and ends with an EOF marker', async () => {
    const bytes = await createSyntheticPdf([{}])
    const text = new TextDecoder('latin1').decode(bytes)

    expect(text.startsWith('%PDF-1.7')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('escapes the characters PDF strings treat specially', async () => {
    const opened = await openPdf(await createSyntheticPdf([
      { text: [{ x: 72, y: 700, content: String.raw`a (b) c\d` }] },
    ]))
    try {
      const page = await opened.document.getPage(1)
      const content = await page.getTextContent()
      const text = content.items.map(item => ('str' in item ? item.str : '')).join('')
      expect(text).toBe(String.raw`a (b) c\d`)
    } finally {
      await opened.close()
    }
  })

  it('embeds an image that pdf.js can paint', async () => {
    const opened = await openPdf(await createSyntheticPdf([
      { images: [{ raster: createRaster(40, 20, [200, 30, 30, 255]), x: 0, y: 0, width: A4.width, height: A4.height }] },
    ]))
    try {
      const page = await opened.document.getPage(1)
      const operators = await page.getOperatorList()
      expect(operators.fnArray.length).toBeGreaterThan(0)
    } finally {
      await opened.close()
    }
  })

  it('refuses to write a PDF with no pages', async () => {
    await expect(createSyntheticPdf([])).rejects.toThrow(/at least one page/)
  })
})

import { encodeImage } from '@scanmate/ink'
import type { Raster } from '@scanmate/ink'

/**
 * Write a small, valid PDF from a description of its pages.
 *
 * Tests need PDFs whose every property is known - a born-digital page with known
 * text, a page that is one scanned bitmap at a known dpi, a page with a logo, a
 * rotated page, documents with mismatched page counts - and real documents cannot
 * be committed. This writes exactly those, byte for byte, with a correct
 * cross-reference table, so pdf.js reads them the way it reads anything else.
 * Also useful for smoke-testing a deployment without shipping a fixture.
 *
 * Text uses the standard-14 Helvetica, deliberately unembedded, which exercises
 * the standard-font data path. Images are embedded as JPEG (`DCTDecode`), which
 * is how most scanners and phone apps store a page.
 */

export interface SyntheticText {
  /** Position of the baseline start, in points from the bottom-left corner. */
  x:          number
  y:          number
  /** Point size. Default 12. */
  size?:      number
  /** Printable ASCII. */
  content:    string
  /** Render mode 3: present in the text layer, painted nowhere - what an OCR layer over a scan is. */
  invisible?: boolean
}

export interface SyntheticImage {
  raster: Raster
  /** Where and how large to paint it, in points from the bottom-left corner. */
  x:      number
  y:      number
  width:  number
  height: number
}

export interface SyntheticLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SyntheticPdfPage {
  /** In points. Default A4, 595.28 x 841.89. */
  width?:  number
  height?: number
  rotate?: 0 | 90 | 180 | 270
  text?:   SyntheticText[]
  images?: SyntheticImage[]
  lines?:  SyntheticLine[]
}

export const A4 = { width: 595.28, height: 841.89 } as const

/** Objects 1-3 are fixed: the catalog, the page tree and the one font. */
const CATALOG = 1
const PAGE_TREE = 2
const FONT = 3

export async function createSyntheticPdf (pages: readonly SyntheticPdfPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new RangeError('a PDF needs at least one page')

  const objects: Uint8Array[] = []
  /** Append an object and return its number, which is its one-based position. */
  const add = (body: Uint8Array): number => {
    objects.push(body)

    return objects.length
  }
  add(new Uint8Array(0)) // catalog, written last
  add(new Uint8Array(0)) // page tree, written last
  add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))

  const pageIds: number[] = []
  for (const page of pages) pageIds.push(await writePage(page, add))

  const kids = pageIds.map(id => `${id} 0 R`).join(' ')
  objects[CATALOG - 1] = ascii(`<< /Type /Catalog /Pages ${PAGE_TREE} 0 R >>`)
  objects[PAGE_TREE - 1] = ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`)

  return serialise(objects)
}

async function writePage (page: SyntheticPdfPage, add: (body: Uint8Array) => number): Promise<number> {
  const { width = A4.width, height = A4.height, rotate = 0, images = [], lines = [], text = [] } = page
  const imageRefs: string[] = []
  const contents: string[] = []

  for (const [n, image] of images.entries()) {
    const jpeg = await encodeImage(image.raster, { format: 'jpeg', quality: 90 })
    const dictionary = `/Type /XObject /Subtype /Image /Width ${image.raster.width} /Height ${image.raster.height} ` +
      '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'
    const id = add(stream(dictionary, jpeg))
    imageRefs.push(`/Im${n} ${id} 0 R`)
    contents.push(`q ${num(image.width)} 0 0 ${num(image.height)} ${num(image.x)} ${num(image.y)} cm /Im${n} Do Q`)
  }
  for (const line of lines)
    contents.push(`0 0 0 RG 1 w ${num(line.x1)} ${num(line.y1)} m ${num(line.x2)} ${num(line.y2)} l S`)
  for (const item of text) {
    const mode = item.invisible === true ? 3 : 0
    contents.push(`BT /F1 ${num(item.size ?? 12)} Tf ${mode} Tr ${num(item.x)} ${num(item.y)} Td (${escape(item.content)}) Tj ET`)
  }

  const contentStream = ascii(contents.join('\n'))
  const contentId = add(stream('', contentStream))
  const box = `[0 0 ${num(width)} ${num(height)}]`
  const resources = `<< /Font << /F1 ${FONT} 0 R >> /XObject << ${imageRefs.join(' ')} >> >>`

  return add(ascii(
    `<< /Type /Page /Parent ${PAGE_TREE} 0 R /MediaBox ${box} /Rotate ${rotate} /Resources ${resources} /Contents ${contentId} 0 R >>`,
  ))
}

function serialise (objects: readonly Uint8Array[]): Uint8Array {
  const chunks: Uint8Array[] = [ascii('%PDF-1.7\n%âãÏÓ\n')]
  let offset = chunks[0].byteLength
  const offsets: number[] = []

  for (const [i, body] of objects.entries()) {
    offsets.push(offset)
    const framed = [ascii(`${i + 1} 0 obj\n`), body, ascii('\nendobj\n')]
    chunks.push(...framed)
    for (const chunk of framed) offset += chunk.byteLength
  }

  const entries = offsets.map(o => `${String(o).padStart(10, '0')} 00000 n `)
  const trailer = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...entries,
    'trailer',
    `<< /Size ${objects.length + 1} /Root ${CATALOG} 0 R >>`,
    'startxref',
    String(offset),
    '%%EOF',
    '',
  ].join('\n')
  chunks.push(ascii(trailer))

  return concat(chunks)
}

function stream (dictionary: string, data: Uint8Array): Uint8Array {
  return concat([ascii(`<< ${dictionary} /Length ${data.byteLength} >>\nstream\n`), data, ascii('\nendstream')])
}

function concat (chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0
  for (const chunk of chunks) length += chunk.byteLength
  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }

  return out
}

/** Latin-1 bytes, one per character: PDF syntax is bytes, not UTF-8. */
function ascii (text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = (text.codePointAt(i) ?? 0) & 0xFF

  return out
}

function escape (text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('(', String.raw`\(`).replaceAll(')', String.raw`\)`)
}

/** Numbers as PDF writes them: no exponent, at most four decimals. */
function num (value: number): string {
  return String(Math.round(value * 10_000) / 10_000)
}

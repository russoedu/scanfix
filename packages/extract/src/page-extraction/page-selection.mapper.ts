/**
 * Turn a caller's page selection into page numbers.
 *
 * Accepts either a list of one-based page numbers or a print-dialog range string
 * such as `'1-3,5,8-'` (an open range runs to the last page). The result is
 * sorted and free of repeats, and anything outside the document is an error
 * rather than something quietly dropped - asking for page 9 of an 8-page scan is
 * exactly the mistake this pipeline exists to catch.
 */
export type PageSelection = readonly number[] | string

export function selectPages (selection: PageSelection | undefined, pageCount: number): number[] {
  if (selection === undefined) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const pages = typeof selection === 'string' ? parseRanges(selection, pageCount) : [...selection]
  for (const page of pages)
    if (!Number.isSafeInteger(page) || page < 1 || page > pageCount)
      throw new RangeError(`page ${page} is outside a ${pageCount}-page document`)

  const unique = [...new Set(pages)]
  unique.sort((a, b) => a - b)

  return unique
}

function parseRanges (spec: string, pageCount: number): number[] {
  const parts = spec.split(',').map(p => p.trim()).filter(p => p.length > 0)
  const pages: number[] = []
  for (const part of parts) {
    const [from, to] = bounds(part, pageCount)
    for (let page = from; page <= to; page++) pages.push(page)
  }

  return pages
}

const DIGITS = /^\d+$/

/** A page number, or - on one side of a dash - nothing at all. */
function isBound (text: string, mayBeEmpty: boolean): boolean {
  return (mayBeEmpty && text === '') || DIGITS.test(text)
}

/** `'3'`, `'2-5'`, `'6-'` or `'-4'` as an inclusive `[from, to]`. */
function bounds (part: string, pageCount: number): [number, number] {
  const dash = part.indexOf('-')
  const low = (dash === -1 ? part : part.slice(0, dash)).trim()
  const high = (dash === -1 ? part : part.slice(dash + 1)).trim()
  if (!isBound(low, dash !== -1) || !isBound(high, dash !== -1) || (low === '' && high === ''))
    throw new SyntaxError(`cannot read page range "${part}"`)

  const from = low === '' ? 1 : Number(low)
  const to = high === '' ? pageCount : Number(high)
  if (to < from) throw new SyntaxError(`page range "${part}" runs backwards`)

  return [from, to]
}

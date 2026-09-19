/**
 * How big an image's page is, and where on it the image goes.
 *
 * By default a page is the image at its resolution: a 2480 x 3508 scan at 300
 * dpi becomes an A4 page, and a downstream reader that divides pixels by page
 * inches gets the scan's real resolution back - which is exactly what
 * `@scanmate/extract` does to decide how to render. A fixed paper size instead
 * fits the image inside it, centred, turning the page landscape for a landscape
 * image.
 *
 * Resolution comes from, in order: what the caller says; what the file records,
 * if it is at least {@link MIN_RECORDED_DPI}; the `imageDpi` fallback. The floor
 * is there because 72 and 96 are what cameras and editors write when they know
 * nothing - a phone photo "at 72 dpi" would make a page over a metre tall.
 */

/** `'image'`: the image's own size at its resolution. Otherwise a paper size, or `{ width, height }` in points. */
export type PageSize = 'image' | 'a4' | 'letter' | { width: number, height: number }

export const PAPER = {
  a4:     { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const

/** Recorded densities below this are software defaults, not a scan's resolution. */
export const MIN_RECORDED_DPI = 100

/** In PDF points, from the page's bottom-left corner - PDF's own frame. */
export interface Placement {
  pageWidth:  number
  pageHeight: number
  x:          number
  y:          number
  width:      number
  height:     number
}

export function resolveDpi (given: number | null | undefined, recorded: number | null, fallback: number): number {
  if (given !== undefined && given !== null && given > 0) return given
  if (recorded !== null && recorded >= MIN_RECORDED_DPI) return recorded

  return fallback
}

export function placeImage (pixelWidth: number, pixelHeight: number, dpi: number, pageSize: PageSize, margin = 0): Placement {
  const width = (pixelWidth / dpi) * 72
  const height = (pixelHeight / dpi) * 72
  if (pageSize === 'image') return { pageWidth: width, pageHeight: height, x: 0, y: 0, width, height }

  const paper = typeof pageSize === 'string' ? PAPER[pageSize] : pageSize
  const landscape = pixelWidth > pixelHeight
  const pageWidth = landscape ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height)
  const pageHeight = landscape ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height)
  const scale = Math.min((pageWidth - 2 * margin) / width, (pageHeight - 2 * margin) / height)
  const fitted = { width: width * scale, height: height * scale }

  return { pageWidth, pageHeight, x: (pageWidth - fitted.width) / 2, y: (pageHeight - fitted.height) / 2, ...fitted }
}

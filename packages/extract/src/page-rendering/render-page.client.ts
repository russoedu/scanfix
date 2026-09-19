import { createCanvas, Path2D } from '@napi-rs/canvas'
import { encodeImage } from '@scanmate/ink'
import type { ImageFormat, PageImage, Raster } from '@scanmate/ink'
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Rasterise a PDF page: pdf.js drawing onto a Skia canvas.
 *
 * `@napi-rs/canvas` is a prebuilt native addon with Skia statically linked - no
 * Cairo, no fontconfig, nothing to install on the host - which is what makes it
 * acceptable where `canvas` (node-canvas) is not.
 *
 * Pages render with the `print` intent: the question this pipeline asks is what
 * was on the paper, and printing is what put it there. That includes form-field
 * appearances, which the default screen intent leaves to an HTML layer that
 * does not exist here.
 */

export interface RenderOptions {
  dpi:        number
  /** Encoding for `PageImage.image`; `'none'` keeps only the raster. */
  output:     ImageFormat | 'none'
  quality:    number
  /** CSS colour painted under the page, since a PDF page is transparent where nothing is drawn. */
  background: string
}

export async function renderPage (page: PDFPageProxy, options: RenderOptions): Promise<PageImage> {
  const viewport = page.getViewport({ scale: options.dpi / 72 })
  const width = Math.max(1, Math.ceil(viewport.width))
  const height = Math.max(1, Math.ceil(viewport.height))

  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = options.background
  context.fillRect(0, 0, width, height)

  await withOwnPath2D(() => page.render({
    canvas:        null,
    // pdf.js expects a DOM CanvasRenderingContext2D; Skia's implements the same
    // drawing API, which is all pdf.js calls.
    canvasContext: context,
    viewport,
    intent:        'print',
    background:    options.background,
  }).promise)

  const pixels = context.getImageData(0, 0, width, height).data
  const raster: Raster = { width, height, data: new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength) }

  return {
    raster,
    image: options.output === 'none' ? null : await encodeImage(raster, { format: options.output, quality: options.quality }),
    width,
    height,
    dpi:   options.dpi,
  }
}

const scope = globalThis as { Path2D?: unknown }
let rendering = 0
let hostPath2D: unknown

/**
 * pdf.js builds clip and fill paths with the global `Path2D`, which it fills in
 * from the first canvas module it finds - once, for the whole process. A host
 * that loaded its own pdf.js or `@napi-rs/canvas` first leaves a `Path2D` from
 * that other copy there, and this canvas rejects it ("Value is none of these
 * types"). So every render runs with this module's `Path2D` in place, counted so
 * overlapping renders share it, and the host's comes back when the last ends.
 */
async function withOwnPath2D<T> (render: () => Promise<T>): Promise<T> {
  if (rendering++ === 0) {
    hostPath2D = scope.Path2D
    scope.Path2D = Path2D
  }
  try {
    return await render()
  } finally {
    if (--rendering === 0) scope.Path2D = hostPath2D
  }
}

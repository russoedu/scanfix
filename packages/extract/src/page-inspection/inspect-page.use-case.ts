import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { readTextLayer } from '../text-layer'
import type { EmbeddedImage, PageMetadata } from './page-metadata.contract'
import { classifyPage, SCAN_COVERAGE } from './page-kind.policy'

/**
 * Read a page's size, text and images without rendering it.
 *
 * Images are found by walking the operator list with its graphics-state stack:
 * each paint operator draws the unit square through the current transform, so
 * the transform alone gives where the image lands and how big - which is all
 * that coverage and effective resolution need. The intrinsic pixel size comes
 * from the operator's own arguments, which is public pdf.js API; only the
 * decoded colour kind has to be read from pdf.js's object store.
 */

/** A PDF transform, `[a, b, c, d, e, f]`. */
type Transform = [number, number, number, number, number, number]

const IDENTITY: Transform = [1, 0, 0, 1, 0, 0]

/** pdf.js's `ImageKind`, as the names this package reports. */
const COLOR_KINDS: Readonly<Record<number, EmbeddedImage['colorKind']>> = {
  1: 'gray-1bpp',
  2: 'rgb-24bpp',
  3: 'rgba-32bpp',
}

export async function inspectPage (page: PDFPageProxy): Promise<PageMetadata> {
  const [x0, y0, x1, y1] = page.view
  const pointWidth = x1 - x0
  const pointHeight = y1 - y0

  const { text, items: textItems } = await readTextLayer(page)

  const operators = await page.getOperatorList()
  const images: EmbeddedImage[] = []
  const stack: Transform[] = []
  let ctm = IDENTITY
  let painted = 0
  let drawsPaths = false

  for (let i = 0; i < operators.fnArray.length; i++) {
    const fn = operators.fnArray[i]
    const args = operators.argsArray[i] as unknown[] | null

    switch (fn) {
      case OPS.save: {
        stack.push(ctm)
        break
      }
      case OPS.restore: {
        ctm = stack.pop() ?? IDENTITY
        break
      }
      case OPS.transform: {
        ctm = compose(ctm, args as Transform)
        break
      }
      case OPS.constructPath: {
        drawsPaths = true
        break
      }
      default: {
        const size = imageSize(fn, args)
        if (size === null) continue

        // The unit square through the CTM: its sides are (a, b) and (c, d).
        const placedWidth = Math.hypot(ctm[0], ctm[1])
        const placedHeight = Math.hypot(ctm[2], ctm[3])
        painted += Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])
        images.push({
          width:     size.width,
          height:    size.height,
          placedWidth,
          placedHeight,
          dpiX:      placedWidth > 0 ? size.width / (placedWidth / 72) : 0,
          dpiY:      placedHeight > 0 ? size.height / (placedHeight / 72) : 0,
          colorKind: size.mask ? 'mask' : colorKindOf(page, size.objectId),
        })
      }
    }
  }

  const imageCoverage = Math.min(1, painted / (pointWidth * pointHeight))
  const characterCount = text.replaceAll(/\s/g, '').length
  const kind = classifyPage({ imageCoverage, characterCount, drawsPaths })

  return {
    page:           page.pageNumber,
    pointWidth,
    pointHeight,
    rotation:       normaliseRotation(page.rotate),
    mediaBox:       { x: x0, y: y0, width: pointWidth, height: pointHeight },
    kind,
    imageCoverage,
    hasTextLayer:   characterCount > 0,
    text:           characterCount > 0 ? text : null,
    textItems,
    characterCount,
    embeddedImages: images,
    effectiveDpi:   effectiveDpi(images, imageCoverage),
  }
}

/**
 * The resolution of the bitmap that makes this page a scan, or `null` if it is
 * not one. The largest image is the scan; the geometric mean of its two axes is
 * used because rendering needs one scale, and it is the one that resamples an
 * anamorphic scan least on both axes together.
 */
function effectiveDpi (images: readonly EmbeddedImage[], coverage: number): number | null {
  if (coverage < SCAN_COVERAGE || images.length === 0) return null

  let largest = images[0]
  for (const image of images)
    if (image.placedWidth * image.placedHeight > largest.placedWidth * largest.placedHeight) largest = image

  const dpi = Math.sqrt(largest.dpiX * largest.dpiY)

  return Number.isFinite(dpi) && dpi > 0 ? Math.round(dpi) : null
}

interface ImageSize { width: number, height: number, mask: boolean, objectId: string | null }

/** Intrinsic size of the image a paint operator draws, or `null` if it draws none. */
function imageSize (fn: number, args: unknown[] | null): ImageSize | null {
  if (args === null) return null

  // `paintImageXObjectRepeat` is deliberately absent: its arguments are
  // [objectId, scaleX, scaleY, positions], and repeated tiles are decoration,
  // never the bitmap that makes a page a scan.
  if (fn === OPS.paintImageXObject) {
    // [objectId, width, height]
    const [objectId, width, height] = args as [string, number, number]

    return typeof width === 'number' ? { width, height, mask: false, objectId } : null
  }

  if (fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
    // [{ width, height, ... }]
    const data = args[0] as { width?: number, height?: number } | undefined
    if (typeof data?.width !== 'number' || typeof data.height !== 'number') return null

    return { width: data.width, height: data.height, mask: fn === OPS.paintImageMaskXObject, objectId: null }
  }

  return null
}

function colorKindOf (page: PDFPageProxy, objectId: string | null): EmbeddedImage['colorKind'] {
  if (objectId === null) return null
  try {
    const decoded = page.objs.get(objectId) as { kind?: number } | null

    return COLOR_KINDS[decoded?.kind ?? 0] ?? null
  } catch {
    // Not resolved yet, or pdf.js has changed its internals: colour kind is best-effort.
    return null
  }
}

function compose (m: Transform, n: Transform): Transform {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

function normaliseRotation (rotate: number): PageMetadata['rotation'] {
  const r = ((Math.round(rotate / 90) * 90) % 360 + 360) % 360

  return r as PageMetadata['rotation']
}

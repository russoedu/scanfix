import type { ImageInput, Raster } from '@scanmate/ink'
import { buildMasks } from './ink-masks.use-case'
import type { RegionOptions } from './region.model'

/**
 * An RGBA overlay of the comparison, for looking at with your own eyes.
 *
 * Red is ink the scan added, blue is ink it lost, grey is ink both agree on.
 * A correctly aligned pair of a signed form is almost entirely grey with a red
 * signature; a misaligned one is red and blue confetti along every stroke,
 * which is the fastest way to tell the two failures apart.
 */
export async function renderDiff (
  original: ImageInput,
  aligned: ImageInput,
  options: RegionOptions = {},
): Promise<Raster> {
  const { tolerance = 2, ink } = options
  const masks = await buildMasks(original, aligned, ink, tolerance)
  const { width, height } = masks
  const data = new Uint8ClampedArray(width * height * 4)

  for (let i = 0, p = 0; p < width * height; p++, i += 4) {
    const inOriginal = masks.original.data[p] === 1
    const inScan = masks.scan.data[p] === 1
    const nearOriginal = masks.originalDilated.data[p] === 1

    let r = 255
    let g = 255
    let b = 255

    if (inScan && !nearOriginal) {
      r = 220
      g = 30
      b = 40
    } else if (inOriginal && masks.scanDilated.data[p] === 0) {
      r = 40
      g = 90
      b = 220
    } else if (inOriginal || inScan) {
      r = 110
      g = 110
      b = 110
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }

  return { width, height, data }
}

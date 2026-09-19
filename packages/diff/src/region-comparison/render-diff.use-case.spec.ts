import { cloneRaster, createSyntheticDocument, drawSignature, drawTick } from '@scanmate/ink'
import type { Raster } from '@scanmate/ink'

import { renderDiff } from './render-diff.use-case'

const BLANK = createSyntheticDocument({ width: 520, height: 680, seed: 3 })

/** The same form, filled in: signed, with the first box ticked. */
function filledForm (): Raster {
  const page = cloneRaster(BLANK.raster)
  drawSignature(page, BLANK.regions.signature, 5)
  drawTick(page, BLANK.regions['tick-1'])

  return page
}

describe('renderDiff', () => {
  it('paints added ink red and leaves agreed ink grey', async () => {
    const overlay = await renderDiff(BLANK.raster, filledForm())

    let red = 0
    let grey = 0
    for (let i = 0; i < overlay.data.length; i += 4) {
      const [r, g, b] = [overlay.data[i], overlay.data[i + 1], overlay.data[i + 2]]
      if (r > 200 && g < 80) red++
      else if (r === 110 && g === 110 && b === 110) grey++
    }

    expect(red).toBeGreaterThan(200)
    expect(grey).toBeGreaterThan(red)
    expect(overlay.width).toBe(BLANK.raster.width)
  })
})

import { applyPoint, createRaster, createSyntheticDocument, encodeImage, IDENTITY, inkMap, invert, multiply, normalize, simulateScan, toGrayscale } from '@scanmate/ink'
import type { Matrix3, Raster } from '@scanmate/ink'
import { alignScan } from './align'

const PAGE = createSyntheticDocument({ width: 480, height: 620 })

/** Worst disagreement between two transforms, measured at the page corners, in pixels. */
function cornerError (fitted: Matrix3, truth: Matrix3, page: Raster = PAGE.raster): number {
  let worst = 0
  for (const [x, y] of [[0, 0], [page.width, 0], [0, page.height], [page.width, page.height]]) {
    const a = applyPoint(fitted, x, y)
    const b = applyPoint(truth, x, y)
    worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y))
  }

  return worst
}

describe('alignScan', () => {
  it('returns the identity when the scan is the original', () => {
    const result = alignScan(PAGE.raster, PAGE.raster, { output: 'none' })

    expect(cornerError(result.matrix, IDENTITY)).toBeLessThan(0.5)
    expect(result.confidence).toBeGreaterThan(0.95)
    expect(result.method).toBe('features')
  }, 30_000)

  it('recovers rotation, scale and translation from a clean scan', () => {
    const scan = simulateScan(PAGE.raster, {
      rotationDeg: 3.4,
      scale:       1.3,
      translateX:  -25,
      translateY:  18,
      canvas:      { width: 700, height: 900 },
    })

    const result = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(result.method).toBe('features')
    expect(cornerError(result.matrix, scan.matrix)).toBeLessThan(2)
    expect(result.transform.rotationDeg).toBeCloseTo(3.4, 0)
    expect(result.transform.scaleX).toBeCloseTo(1.3, 1)
    expect(result.confidence).toBeGreaterThan(0.85)
  }, 30_000)

  it('survives noise, blur and a lighting gradient', () => {
    const scan = simulateScan(PAGE.raster, {
      rotationDeg:  -2.2,
      scale:        1.45,
      translateX:   30,
      translateY:   -14,
      noise:        0.02,
      blur:         1,
      illumination: 0.35,
      canvas:       { width: 780, height: 980 },
      seed:         77,
    })

    const result = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(cornerError(result.matrix, scan.matrix)).toBeLessThan(4)
    expect(result.confidence).toBeGreaterThan(0.5)
  }, 30_000)

  it('handles a scan smaller than the original', () => {
    const scan = simulateScan(PAGE.raster, { scale: 0.62, rotationDeg: 1.5 })

    const result = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(cornerError(result.matrix, scan.matrix)).toBeLessThan(3)
  }, 30_000)

  it('fits a stretched axis when asked for an affine model', () => {
    const stretched = createSyntheticDocument({ width: 480, height: 620 }).raster
    const scan = simulateScan(stretched, { scale: 1.2, rotationDeg: 1.1, canvas: { width: 640, height: 820 } })
    // Squash the scan horizontally: a similarity cannot express this.
    const squashed = squash(scan.raster, 0.92)
    const truth = multiply([0.92, 0, 0, 0, 1, 0, 0, 0, 1], scan.matrix)

    const similar = alignScan(stretched, squashed, { model: 'similarity', output: 'none' })
    const affine = alignScan(stretched, squashed, { model: 'affine', output: 'none' })

    expect(cornerError(affine.matrix, truth, stretched)).toBeLessThan(3)
    expect(affine.confidence).toBeGreaterThan(similar.confidence)
  }, 45_000)

  it('fits a perspective warp when asked for a homography', () => {
    const truth: Matrix3 = [1.02, 0.05, 14, -0.02, 1.01, -9, 0.00022, 0.00009, 1]
    const scanned = warpThrough(PAGE.raster, truth, 700, 900)

    const result = alignScan(PAGE.raster, scanned, { model: 'homography', output: 'none' })

    expect(cornerError(result.matrix, truth)).toBeLessThan(4)
  }, 45_000)

  it('puts the output on the original canvas, whatever the scan measured', () => {
    const scan = simulateScan(PAGE.raster, { scale: 1.9, rotationDeg: 4 })
    const result = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(result.width).toBe(PAGE.raster.width)
    expect(result.height).toBe(PAGE.raster.height)
    expect(result.raster.data.length).toBe(PAGE.raster.width * PAGE.raster.height * 4)
  }, 30_000)

  it('reports an inverse that undoes the matrix', () => {
    const scan = simulateScan(PAGE.raster, { rotationDeg: 2, scale: 1.1 })
    const result = alignScan(PAGE.raster, scan.raster, { output: 'none' })
    const round = normalize(multiply(result.inverse, result.matrix))

    for (const [i, value] of round.entries()) expect(value).toBeCloseTo(IDENTITY[i], 6)
  }, 30_000)

  it('accepts encoded bytes as readily as rasters', () => {
    const scan = simulateScan(PAGE.raster, { rotationDeg: 1.8, scale: 1.15 })
    const result = alignScan(
      encodeImage(PAGE.raster, { format: 'png' }),
      encodeImage(scan.raster, { format: 'jpeg', quality: 88 }),
      { output: 'none' },
    )

    expect(cornerError(result.matrix, scan.matrix)).toBeLessThan(3)
  }, 30_000)

  it('encodes the output only when asked to', () => {
    const png = alignScan(PAGE.raster, PAGE.raster, { output: 'png' })
    const none = alignScan(PAGE.raster, PAGE.raster, { output: 'none' })

    expect(png.image?.[0]).toBe(0x89)
    expect(none.image).toBeNull()
  }, 30_000)

  it('is deterministic', () => {
    const scan = simulateScan(PAGE.raster, { rotationDeg: 2.7, scale: 1.22, noise: 0.01 })
    const a = alignScan(PAGE.raster, scan.raster, { output: 'none' })
    const b = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(a.matrix).toEqual(b.matrix)
  }, 45_000)

  it('falls back to the coarse estimate instead of failing on a near-blank page', () => {
    const blank = createRaster(300, 400)
    // One faint mark, far too little for a thousand corners.
    for (let y = 190; y < 210; y++)
      for (let x = 140; x < 160; x++) {
        const i = (y * 300 + x) * 4
        blank.data[i] = 90
        blank.data[i + 1] = 90
        blank.data[i + 2] = 90
      }
    const scan = simulateScan(blank, { translateX: 6, translateY: -4 })

    const result = alignScan(blank, scan.raster, { output: 'none' })

    expect(result.method).toBe('coarse')
    expect(result.raster.width).toBe(300)
  }, 30_000)

  it('reports diagnostics that explain the answer', () => {
    const scan = simulateScan(PAGE.raster, { rotationDeg: 5.5, scale: 1.18 })
    const { diagnostics } = alignScan(PAGE.raster, scan.raster, { output: 'none' })

    expect(diagnostics.skewDeg.scanned - diagnostics.skewDeg.original).toBeCloseTo(5.5, 0)
    expect(diagnostics.inliers).toBeGreaterThan(20)
    expect(diagnostics.inlierRatio).toBeGreaterThan(0.3)
    expect(diagnostics.reprojectionError).toBeLessThan(3)
    expect(diagnostics.intersectionOverUnion).toBeGreaterThan(0.5)
    expect(diagnostics.durationMs).toBeGreaterThanOrEqual(0)
  }, 30_000)

  it('aligns a full-size page', () => {
    const page = createSyntheticDocument({ width: 850, height: 1100, seed: 9 })
    const scan = simulateScan(page.raster, {
      rotationDeg:  1.4,
      scale:        1.5,
      translateX:   40,
      noise:        0.015,
      illumination: 0.25,
      canvas:       { width: 1400, height: 1750 },
      seed:         5,
    })

    const result = alignScan(page.raster, scan.raster, { output: 'none' })

    expect(cornerError(result.matrix, scan.matrix, page.raster)).toBeLessThan(4)
    expect(result.confidence).toBeGreaterThan(0.6)
  }, 120_000)
})

/** Horizontal-only rescale, to build a distortion no similarity can express. */
function squash (source: Raster, factor: number): Raster {
  const width = Math.round(source.width * factor)
  const out = createRaster(width, source.height)

  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.round(x / factor))
      const from = (y * source.width + sx) * 4
      const to = (y * width + x) * 4
      out.data[to] = source.data[from]
      out.data[to + 1] = source.data[from + 1]
      out.data[to + 2] = source.data[from + 2]
      out.data[to + 3] = 255
    }

  return out
}

/** Apply a known forward transform to build a scan with ground truth. */
function warpThrough (source: Raster, forward: Matrix3, width: number, height: number): Raster {
  const inverse = invert(forward)
  const out = createRaster(width, height)

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = applyPoint(inverse, x + 0.5, y + 0.5)
      const sx = Math.round(p.x - 0.5)
      const sy = Math.round(p.y - 0.5)
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue
      const to = (y * width + x) * 4
      const from = (sy * source.width + sx) * 4
      out.data[to] = source.data[from]
      out.data[to + 1] = source.data[from + 1]
      out.data[to + 2] = source.data[from + 2]
    }

  return out
}

describe('ink preparation', () => {
  it('produces near-identical ink from a clean page and a shadowed scan of it', () => {
    const scan = simulateScan(PAGE.raster, { illumination: 0.4 })
    const clean = inkMap(toGrayscale(PAGE.raster))
    const shadowed = inkMap(toGrayscale(scan.raster))

    let difference = 0
    for (let i = 0; i < clean.data.length; i++) difference += Math.abs(clean.data[i] - shadowed.data[i])

    expect(difference / clean.data.length).toBeLessThan(0.06)
  })
})

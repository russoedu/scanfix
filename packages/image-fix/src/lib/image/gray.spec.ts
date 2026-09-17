import type { GrayImage, Raster } from '../types'
import { binarize, boxBlur, coverage, dilate, grayToRaster, inkMap, integralImage, otsuThreshold, toGrayscale } from './gray'
import { createBinary, createGray, createRaster } from './raster'

function grayOf (width: number, height: number, values: number[]): GrayImage {
  const image = createGray(width, height)
  image.data.set(values)

  return image
}

describe('toGrayscale', () => {
  it('maps white to 1 and black to 0', () => {
    const raster = createRaster(2, 1)
    raster.data.set([0, 0, 0, 255], 4)
    const gray = toGrayscale(raster)

    expect(gray.data[0]).toBeCloseTo(1, 6)
    expect(gray.data[1]).toBeCloseTo(0, 6)
  })

  it('weights the channels by Rec. 601 luminance', () => {
    const raster = createRaster(1, 1, [0, 255, 0, 255])

    expect(toGrayscale(raster).data[0]).toBeCloseTo(0.587, 3)
  })

  it('composites transparency over white, not over black', () => {
    const raster = createRaster(1, 1, [0, 0, 0, 0])

    expect(toGrayscale(raster).data[0]).toBeCloseTo(1, 6)
  })
})

describe('integralImage', () => {
  it('accumulates every rectangle sum in four lookups', () => {
    const image = grayOf(3, 2, [1, 2, 3, 4, 5, 6])
    const sum = integralImage(image)
    const stride = 4

    // Whole image.
    expect(sum[2 * stride + 3]).toBe(21)
    // Top-left 2x1.
    expect(sum[1 * stride + 2]).toBe(3)
  })
})

describe('boxBlur', () => {
  it('leaves a constant image constant, including at the borders', () => {
    const image = createGray(9, 7)
    image.data.fill(0.42)
    const blurred = boxBlur(image, 3)

    for (const value of blurred.data) expect(value).toBeCloseTo(0.42, 6)
  })

  it('spreads a single bright pixel over its window', () => {
    const image = createGray(5, 5)
    image.data[12] = 1
    const blurred = boxBlur(image, 1)

    // A 3x3 window over the centre: the spike is now 1/9 everywhere it reaches.
    expect(blurred.data[12]).toBeCloseTo(1 / 9, 6)
    expect(blurred.data[6]).toBeCloseTo(1 / 9, 6)
    expect(blurred.data[0]).toBeCloseTo(0, 6)
  })

  it('is a no-op at radius zero', () => {
    const image = grayOf(2, 2, [0, 0.5, 1, 0.25])

    expect([...boxBlur(image, 0).data]).toEqual([...image.data])
  })
})

describe('otsuThreshold', () => {
  it('splits a clearly bimodal histogram between the modes', () => {
    const image = createGray(100, 1)
    for (let i = 0; i < 100; i++) image.data[i] = i < 50 ? 0.1 : 0.9

    const threshold = otsuThreshold(image)

    expect(threshold).toBeGreaterThan(0.1)
    expect(threshold).toBeLessThan(0.9)
  })
})

describe('binarize', () => {
  it('will not call half of a blank page ink', () => {
    // Pure noise around zero has no real split, and Otsu would happily invent one.
    const image = createGray(64, 64)
    for (let i = 0; i < image.data.length; i++) image.data[i] = (i % 7) * 0.001

    expect(coverage(binarize(image))).toBe(0)
  })

  it('honours an explicit threshold', () => {
    const image = grayOf(4, 1, [0.1, 0.3, 0.6, 0.9])

    expect([...binarize(image, 0.5).data]).toEqual([0, 0, 1, 1])
  })
})

describe('dilate', () => {
  it('grows a single pixel into a square of the requested radius', () => {
    const mask = createBinary(7, 7)
    mask.data[3 * 7 + 3] = 1
    const grown = dilate(mask, 1)

    let hits = 0
    for (const value of grown.data) hits += value

    expect(hits).toBe(9)
    expect(grown.data[2 * 7 + 2]).toBe(1)
    expect(grown.data[1 * 7 + 1]).toBe(0)
  })

  it('is a no-op at radius zero', () => {
    const mask = createBinary(3, 3)
    mask.data[4] = 1

    expect([...dilate(mask, 0).data]).toEqual([...mask.data])
  })
})

describe('inkMap', () => {
  it('reports near-zero ink for blank paper whatever shade it is', () => {
    for (const shade of [255, 220, 180]) {
      const raster = createRaster(64, 64, [shade, shade, shade, 255])
      const ink = inkMap(toGrayscale(raster))
      let total = 0
      for (const value of ink.data) total += value

      expect(total / ink.data.length).toBeLessThan(0.01)
    }
  })

  it('survives a lighting gradient that halves one side of the page', () => {
    const size = 96
    const flat = createRaster(size, size)
    const shaded = createRaster(size, size)

    // Same three marks on both, but the second is lit unevenly left to right.
    for (const page of [flat, shaded])
      for (const cx of [20, 48, 76])
        for (let y = 30; y < 66; y++)
          for (let x = cx - 4; x < cx + 4; x++) {
            const i = (y * size + x) * 4
            page.data[i] = 20
            page.data[i + 1] = 20
            page.data[i + 2] = 20
          }

    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const factor = 1 - 0.5 * (x / size)
        const i = (y * size + x) * 4
        shaded.data[i] *= factor
        shaded.data[i + 1] *= factor
        shaded.data[i + 2] *= factor
      }

    const flatInk = inkMap(toGrayscale(flat))
    const shadedInk = inkMap(toGrayscale(shaded))

    let difference = 0
    for (let i = 0; i < flatInk.data.length; i++) difference += Math.abs(flatInk.data[i] - shadedInk.data[i])

    expect(difference / flatInk.data.length).toBeLessThan(0.05)
  })
})

describe('grayToRaster', () => {
  it('round-trips through toGrayscale', () => {
    const image = grayOf(2, 1, [0, 1])
    const raster: Raster = grayToRaster(image)
    const back = toGrayscale(raster)

    expect(back.data[0]).toBeCloseTo(0, 2)
    expect(back.data[1]).toBeCloseTo(1, 2)
  })
})

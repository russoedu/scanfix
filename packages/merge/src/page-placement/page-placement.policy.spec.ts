import { MIN_RECORDED_DPI, PAPER, placeImage, resolveDpi } from './page-placement.policy'

describe('placeImage', () => {
  it('makes the page the image at its resolution: 300-dpi A4 pixels give an A4 page', () => {
    const placed = placeImage(2480, 3508, 300, 'image')

    expect(placed.pageWidth).toBeCloseTo(595.2, 1)
    expect(placed.pageHeight).toBeCloseTo(841.9, 1)
    expect(placed).toMatchObject({ x: 0, y: 0 })
  })

  it('fits an image into a paper size, centred, keeping its shape', () => {
    const placed = placeImage(1000, 1000, 100, 'a4')

    expect({ w: placed.pageWidth, h: placed.pageHeight }).toEqual({ w: PAPER.a4.width, h: PAPER.a4.height })
    expect(placed.width).toBeCloseTo(PAPER.a4.width, 5)
    expect(placed.height).toBeCloseTo(placed.width, 5)
    expect(placed.y).toBeCloseTo((PAPER.a4.height - placed.height) / 2, 5)
  })

  it('turns the paper landscape for a landscape image, and keeps a margin', () => {
    const placed = placeImage(3000, 2000, 300, 'letter', 36)

    expect(placed.pageWidth).toBe(792)
    expect(placed.pageHeight).toBe(612)
    expect(placed.x).toBeGreaterThanOrEqual(36)
    expect(placed.y).toBeGreaterThanOrEqual(36 - 1e-9)
  })
})

describe('resolveDpi', () => {
  it('takes what the caller says, then what the file records, then the fallback', () => {
    expect(resolveDpi(200, 300, 150)).toBe(200)
    expect(resolveDpi(undefined, 300, 150)).toBe(300)
    expect(resolveDpi(null, null, 150)).toBe(150)
  })

  it('ignores the 72 and 96 dpi that software writes when it knows nothing', () => {
    expect(MIN_RECORDED_DPI).toBe(100)
    expect(resolveDpi(undefined, 72, 150)).toBe(150)
    expect(resolveDpi(undefined, 96, 150)).toBe(150)
  })
})

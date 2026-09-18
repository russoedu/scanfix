import { createRaster, isRaster } from './raster.model'
import { decodeImage, encodeImage, sniffFormat } from './image-codec.use-case'

function gradient (width: number, height: number) {
  const raster = createRaster(width, height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      raster.data[i] = (x * 255) / width
      raster.data[i + 1] = (y * 255) / height
      raster.data[i + 2] = 128
      raster.data[i + 3] = 255
    }

  return raster
}

describe('sniffFormat', () => {
  it('identifies PNG and JPEG by their magic bytes', () => {
    const png = encodeImage(createRaster(2, 2), { format: 'png' })
    const jpeg = encodeImage(createRaster(8, 8), { format: 'jpeg' })

    expect(sniffFormat(png)).toBe('png')
    expect(sniffFormat(jpeg)).toBe('jpeg')
  })

  it('returns null for anything else', () => {
    expect(sniffFormat(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull()
  })
})

describe('decodeImage', () => {
  it('round-trips PNG without losing a bit', () => {
    const source = gradient(16, 12)
    const decoded = decodeImage(encodeImage(source, { format: 'png' }))

    expect(decoded.width).toBe(16)
    expect(decoded.height).toBe(12)
    expect([...decoded.data]).toEqual([...source.data])
  })

  it('round-trips JPEG to within its own quantisation', () => {
    const source = gradient(32, 32)
    const decoded = decodeImage(encodeImage(source, { format: 'jpeg', quality: 95 }))

    let error = 0
    for (let i = 0; i < source.data.length; i++) error += Math.abs(source.data[i] - decoded.data[i])

    expect(error / source.data.length).toBeLessThan(6)
  })

  it('passes an already-decoded raster straight through', () => {
    const source = gradient(4, 4)

    expect(decodeImage(source)).toBe(source)
  })

  it('accepts an ArrayBuffer as well as a view', () => {
    const encoded = encodeImage(gradient(8, 8), { format: 'png' })
    const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)

    expect(isRaster(decodeImage(buffer as ArrayBuffer))).toBe(true)
  })

  it('rejects an empty buffer and an unknown format', () => {
    expect(() => decodeImage(new Uint8Array(0))).toThrow(/empty/)
    expect(() => decodeImage(Uint8Array.from([1, 2, 3, 4]))).toThrow(/unsupported/)
  })
})

describe('isRaster', () => {
  it('rejects an object whose data length contradicts its dimensions', () => {
    expect(isRaster({ width: 4, height: 4, data: new Uint8ClampedArray(4) })).toBe(false)
    expect(isRaster({ width: 4, height: 4, data: new Uint8ClampedArray(64) })).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isRaster(null)).toBe(false)
    expect(isRaster('png')).toBe(false)
  })
})

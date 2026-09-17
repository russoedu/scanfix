import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js'
import { PNG } from 'pngjs'

import type { ImageInput, Raster } from '../types'
import { asClamped, isRaster, toBytes } from './raster'

/**
 * Encoding and decoding, in pure JavaScript on purpose.
 *
 * `sharp` would be faster, and it is the wrong choice here: it is a native
 * binding to libvips, so the bytes that work on your laptop are not the bytes
 * that run in the function app, and a deployment that skips the rebuild fails
 * at *import* time — after the cold start, in production, with a stack trace
 * about a missing `.node` file. `pngjs` and `jpeg-js` are slower and they are
 * the same JavaScript everywhere, which is the whole point of the constraint
 * this library was written under.
 */

export type ImageFormat = 'png' | 'jpeg'

export interface EncodeOptions {
  format?:  ImageFormat
  /** JPEG only, 1-100. Ignored for PNG. */
  quality?: number
}

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF]

/** Identify a buffer by its magic bytes. Returns `null` when it is neither PNG nor JPEG. */
export function sniffFormat (bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_MAGIC)) return 'png'
  if (startsWith(bytes, JPEG_MAGIC)) return 'jpeg'

  return null
}

/**
 * Decode PNG or JPEG bytes to RGBA, or pass a {@link Raster} straight through.
 *
 * Passing a raster through untouched is what makes it cheap to align a page
 * against several scans: decode once, reuse.
 */
export function decodeImage (input: ImageInput): Raster {
  if (isRaster(input)) return input

  const bytes = toBytes(input)
  if (bytes === null || bytes.length === 0) throw new Error('cannot decode an empty image buffer')

  const format = sniffFormat(bytes)
  if (format === 'png') {
    const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))

    return { width: png.width, height: png.height, data: asClamped(png.data) }
  }

  if (format === 'jpeg') {
    const jpeg = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true })

    return { width: jpeg.width, height: jpeg.height, data: asClamped(jpeg.data) }
  }

  throw new Error('unsupported image format: expected PNG or JPEG')
}

/** Encode a raster. PNG by default, because a scan re-encoded as JPEG is a scan with new artefacts. */
export function encodeImage (image: Raster, options: EncodeOptions = {}): Uint8Array {
  const { format = 'png', quality = 92 } = options

  if (format === 'jpeg') {
    const encoded = encodeJpeg(
      { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength) },
      quality,
    )

    return Uint8Array.from(encoded.data)
  }

  const png = new PNG({ width: image.width, height: image.height })
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength)

  return Uint8Array.from(PNG.sync.write(png))
}

function startsWith (bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false
  for (const [i, byte] of magic.entries()) if (bytes[i] !== byte) return false

  return true
}

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createRaster } from '@scanmate/ink'

import { MergeSourceError } from './merge-source.contract'
import { isPdf, readSource } from './read-source.use-case'

const PDF = new TextEncoder().encode('%PDF-1.7\n%...')

describe('readSource', () => {
  it('tells a PDF from an image by its content, from a path, a URL or bytes', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'merge-'))
    const path = join(folder, 'scan.jpg')
    await writeFile(path, PDF)

    expect(await readSource(path, 0)).toMatchObject({ kind: 'pdf' })
    expect(await readSource(pathToFileURL(path), 0)).toMatchObject({ kind: 'pdf' })
    expect(await readSource(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), 0)).toMatchObject({ kind: 'image' })
  })

  it('takes a raster, or a raster with its resolution and encoded bytes', async () => {
    const raster = createRaster(2, 2)

    expect(await readSource(raster, 0)).toEqual({ kind: 'raster', raster, dpi: null, bytes: null })
    expect(await readSource({ raster, dpi: 144 }, 0)).toEqual({ kind: 'raster', raster, dpi: 144, bytes: null })
  })

  it('names the source it cannot read', async () => {
    await expect(readSource(new Uint8Array(0), 3)).rejects.toMatchObject({ index: 3 })
    await expect(readSource('C:/no/such/file.pdf', 1)).rejects.toBeInstanceOf(MergeSourceError)
  })
})

describe('isPdf', () => {
  it('finds the header within the first kilobyte, as PDF readers do', () => {
    expect(isPdf(PDF)).toBe(true)
    const padded = (spaces: number): Uint8Array => {
      const bytes = new Uint8Array(spaces + PDF.length).fill(0x20)
      bytes.set(PDF, spaces)

      return bytes
    }

    expect(isPdf(padded(100))).toBe(true)
    expect(isPdf(padded(2000))).toBe(false)
    expect(isPdf(new TextEncoder().encode('%PNG'))).toBe(false)
  })
})

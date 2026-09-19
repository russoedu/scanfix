import { copyFile, mkdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { encodeImage, isRaster } from '@scanmate/ink'
import type { Raster } from '@scanmate/ink'
import { createWorker, OEM } from 'tesseract.js'

import type { OcrEngine, OcrLine, RecognisedText, RecogniseHints } from './ocr-engine.contract'

/**
 * Tesseract, through tesseract.js: WebAssembly, nothing to install on the host.
 *
 * Language data comes from the `@tesseract.js-data/<language>` packages -
 * English is a dependency; any other language is `npm install
 * @tesseract.js-data/<code>` - and is read from disk, never downloaded. `best`
 * is the "best_int" LSTM model: measured on real scans it read as well as the
 * standard model (word recall 0.917 against 0.917) at a quarter of the size.
 *
 * Nothing is written anywhere unless configured to be. That matters where the
 * code is deployed read-only, as on Azure Functions: tesseract.js otherwise
 * caches unpacked language data in the current directory. The two things that
 * can write are both explicit, and both go under `cache.path`, which defaults to
 * the OS temp directory:
 *
 * - `cache.method` other than `'none'` keeps tesseract.js's unpacked data there;
 * - reading more than one language stages their files into one folder there,
 *   because tesseract.js takes a single data folder for all of them. (It also
 *   accepts the data itself instead of a folder, but in 7.0.0 initialises with
 *   the data where the language code belongs, so that route is closed.)
 *
 * What was resolved is on `engine.settings`, so it can be logged and checked.
 */

export interface TesseractEngineOptions {
  /** Tesseract language codes, read together. Default `['eng']`. */
  languages?:        readonly string[]
  /** `'best'` (the default) is the LSTM "best_int" model; `'standard'` the larger 4.0.0 one. */
  model?:            'best' | 'standard'
  /** A folder holding `<code>.traineddata.gz` per language, instead of the data packages. */
  languageData?:     string
  cache?:            TesseractCacheOptions
  /** Tesseract page segmentation mode. Default `3`, fully automatic - right for whole pages. */
  pageSegmentation?: number
}

export interface TesseractCacheOptions {
  /**
   * - `'none'` (the default): read language data from its package on every
   *   start, write nothing.
   * - `'write'`: keep tesseract.js's unpacked data under `path` and reuse it.
   * - `'readOnly'`: reuse data a previous run left under `path`; never write.
   * - `'refresh'`: rewrite it.
   */
  method?: 'none' | 'write' | 'readOnly' | 'refresh'
  /** Where anything written goes. Default a `scanmate-ocr` folder in the OS temp directory. */
  path?:   string
}

/** What an engine resolved its options to. */
export interface TesseractSettings {
  languages:        readonly string[]
  model:            'best' | 'standard'
  /** The folder the language data is read from. */
  languageData:     string
  cacheMethod:      NonNullable<TesseractCacheOptions['method']>
  cachePath:        string
  pageSegmentation: number
}

export interface TesseractEngine extends OcrEngine {
  readonly settings: TesseractSettings
}

export const DEFAULT_TESSERACT_OPTIONS = {
  languages:        ['eng'],
  model:            'best',
  cache:            { method: 'none', path: join(tmpdir(), 'scanmate-ocr') },
  pageSegmentation: 3,
} as const

const MODEL_FOLDER = { best: '4.0.0_best_int', standard: '4.0.0' } as const

export async function createTesseractEngine (options: TesseractEngineOptions = {}): Promise<TesseractEngine> {
  const languages = [...(options.languages ?? DEFAULT_TESSERACT_OPTIONS.languages)]
  if (languages.length === 0) throw new RangeError('at least one language is needed')

  const model = options.model ?? DEFAULT_TESSERACT_OPTIONS.model
  const cacheMethod = options.cache?.method ?? DEFAULT_TESSERACT_OPTIONS.cache.method
  const cachePath = options.cache?.path ?? DEFAULT_TESSERACT_OPTIONS.cache.path
  const pageSegmentation = options.pageSegmentation ?? DEFAULT_TESSERACT_OPTIONS.pageSegmentation

  const languageData = options.languageData ?? await languageFolder(languages, model, cachePath)
  if (cacheMethod !== 'none') await mkdir(cachePath, { recursive: true })

  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    langPath: languageData,
    gzip:     true,
    cacheMethod,
    cachePath,
  })
  // Tesseract reports what it estimates ("Estimating resolution as 362") to
  // stderr; a library has no business writing to its host's console.
  await worker.setParameters({ debug_file: '/dev/null' })

  let terminated = false
  let applied = ''
  const settings: TesseractSettings = { languages, model, languageData, cacheMethod, cachePath, pageSegmentation }
  const LAYOUT = { page: pageSegmentation, line: 7, word: 8 }

  return {
    name:    'tesseract.js',
    version: tesseractVersion(),
    languages,
    settings,
    async recognise (image: Raster | Uint8Array, hints: RecogniseHints = {}): Promise<RecognisedText> {
      const mode = LAYOUT[hints.layout ?? 'page']
      const characters = hints.characters ?? ''
      // Parameters persist on the worker, so set them only when they change.
      if (applied !== `${mode}|${characters}`) {
        await worker.setParameters({ tessedit_pageseg_mode: String(mode), tessedit_char_whitelist: characters } as never)
        applied = `${mode}|${characters}`
      }
      const bytes = isRaster(image) ? await encodeImage(image, { format: 'png' }) : image
      const { data } = await worker.recognize(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {}, { text: true, blocks: true })
      const lines: OcrLine[] = []
      const blocks = data.blocks ?? []
      for (const block of blocks)
        for (const paragraph of block.paragraphs)
          for (const line of paragraph.lines)
            lines.push({
              text:  line.text.trim(),
              words: line.words.map(w => ({
                text:       w.text,
                confidence: w.confidence,
                x:          w.bbox.x0,
                y:          w.bbox.y0,
                width:      w.bbox.x1 - w.bbox.x0,
                height:     w.bbox.y1 - w.bbox.y0,
              })),
            })

      return { text: data.text ?? '', confidence: data.confidence ?? 0, lines }
    },
    async terminate (): Promise<void> {
      if (terminated) return
      terminated = true
      await worker.terminate()
    },
  }
}

const require = createRequire(import.meta.url)

/**
 * The folder tesseract.js will read every language from. One language: its
 * package's own folder, read in place. Several: their files copied - once, and
 * again only if a size differs - into one folder under `cachePath`.
 */
async function languageFolder (languages: readonly string[], model: 'best' | 'standard', cachePath: string): Promise<string> {
  const sources = languages.map(code => ({ code, folder: join(packageFolder(code), MODEL_FOLDER[model]) }))
  if (sources.length === 1) return sources[0].folder

  const staged = join(cachePath, `tessdata-${MODEL_FOLDER[model]}`)
  await mkdir(staged, { recursive: true })
  for (const { code, folder } of sources) {
    const file = `${code}.traineddata.gz`
    const [from, to] = await Promise.all([sizeOf(join(folder, file)), sizeOf(join(staged, file))])
    if (to !== from) await copyFile(join(folder, file), join(staged, file))
  }

  return staged
}

/** Bytes in a file, or `null` when there is no file. */
async function sizeOf (path: string): Promise<number | null> {
  try {
    const { size } = await stat(path)

    return size
  } catch {
    return null
  }
}

function packageFolder (code: string): string {
  try {
    return dirname(require.resolve(`@tesseract.js-data/${code}/package.json`))
  } catch {
    throw new Error(`no data for OCR language '${code}': install it with npm install @tesseract.js-data/${code}`)
  }
}

function tesseractVersion (): string {
  try {
    return (require('tesseract.js/package.json') as { version: string }).version
  } catch {
    return 'unknown'
  }
}

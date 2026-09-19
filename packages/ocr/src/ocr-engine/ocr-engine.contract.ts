import type { Raster } from '@scanmate/ink'

/**
 * The seam between reading and everything done with what was read.
 *
 * `ocrPages` needs text with positions and nothing else, so any engine can sit
 * behind it: the bundled tesseract, a native one, a cloud service. It also
 * means a batch pays an engine's start-up - loading tens of megabytes of model
 * into a WASM heap - once, not once a page: create one engine, pass it to
 * every call, terminate it when done.
 */
export interface OcrEngine {
  readonly name:      string
  readonly version:   string
  readonly languages: readonly string[]
  /** Read an image: a raster, or encoded bytes. Positions come back in the image's pixels. */
  recognise (image: Raster | Uint8Array, hints?: RecogniseHints): Promise<RecognisedText>
  /** Release the engine. Safe to call twice. */
  terminate (): Promise<void>
}

/**
 * What the caller knows about an image that the engine would otherwise guess.
 * An engine that cannot use a hint ignores it.
 */
export interface RecogniseHints {
  /**
   * `'page'` (the default) finds the layout itself; `'line'` is one line of
   * text, `'word'` a single word - what a crop around one printed run is.
   */
  layout?:     'page' | 'line' | 'word'
  /** The only characters that may be read - digits and separators, for a figure. */
  characters?: string
}

/** A word as read, with its box in pixels of the image read. */
export interface OcrWord {
  text:       string
  /** 0-100, the engine's own confidence. */
  confidence: number
  x:          number
  y:          number
  width:      number
  height:     number
}

export interface OcrLine {
  text:  string
  words: OcrWord[]
}

export interface RecognisedText {
  /** Plain text, in the engine's reading order. */
  text:       string
  /** 0-100, for the whole image. */
  confidence: number
  lines:      OcrLine[]
}

/** Reading an image: the engine seam, and tesseract behind it. */

export type { OcrEngine, OcrLine, OcrWord, RecognisedText, RecogniseHints } from './ocr-engine.contract'
export { createTesseractEngine, DEFAULT_TESSERACT_OPTIONS } from './tesseract-engine.client'
export type { TesseractCacheOptions, TesseractEngine, TesseractEngineOptions, TesseractSettings } from './tesseract-engine.client'

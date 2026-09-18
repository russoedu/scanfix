/**
 * jpeg-js ships no types. Only the two entry points this library calls are
 * declared, deliberately: a fuller transcription would be a second copy of
 * someone else's API to keep in sync.
 */
declare module 'jpeg-js' {
  export interface RawImageData {
    width:  number
    height: number
    data:   Uint8Array
  }

  export interface DecodeOptions {
    useTArray?:          boolean
    colorTransform?:     boolean
    formatAsRGBA?:       boolean
    tolerantDecoding?:   boolean
    maxResolutionInMP?:  number
    maxMemoryUsageInMB?: number
  }

  export function decode (jpegData: Uint8Array | ArrayBuffer, options?: DecodeOptions): RawImageData
  export function encode (imgData: RawImageData, quality?: number): RawImageData
}

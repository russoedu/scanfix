import * as imageFix from './index'

/**
 * This package is now a forwarding barrel, and its only job is to keep the
 * surface it published working until callers move. So the test is the surface.
 *
 * `sniffFormat` is the one deliberate removal: it only recognised PNG and JPEG,
 * so once the codec read TIFF, HEIF, WebP and AVIF it had become a misleading
 * answer to "what is this file". `readImageMetadata` in `@scanmate/ink` replaces it.
 */
const PUBLISHED = [
  'alignScan', 'applyPoint', 'binarize', 'boxBlur', 'boxBlurRaster', 'cloneRaster', 'compareRegions',
  'conjugateScale', 'contentExtent', 'correlation', 'coverage', 'createBinary', 'createGray', 'createRaster',
  'createSyntheticDocument', 'decodeImage', 'decompose', 'detectAndDescribe', 'determinant', 'diffDocument',
  'dilate', 'downscaleGray', 'drawSignature', 'drawTick', 'encodeImage', 'estimateCoarse', 'estimateSkew',
  'findInliers', 'fitAffine', 'fitHomography', 'fitModel', 'fitSimilarity', 'grayToRaster', 'hamming',
  'IDENTITY', 'inkMap', 'intersectionOverUnion', 'invert', 'isPlausible', 'isRaster', 'mapRectCorners',
  'matchFeatures', 'mean', 'minimumSamples', 'multiply', 'normalize', 'otsuThreshold', 'phaseCorrelate',
  'polishTranslation', 'popcount', 'ransac', 'rebase', 'renderDiff', 'reprojectionError', 'resizeGray',
  'sampleGrayBilinear', 'scaling', 'similarity', 'simulateScan', 'toGrayscale', 'translation', 'warpGray',
  'warpRaster',
] as const

describe('@scanmate/image-fix', () => {
  it('still exports every value it published, except the one deliberately retired', () => {
    const exported = new Set(Object.keys(imageFix))
    const missing = PUBLISHED.filter(name => !exported.has(name))

    expect(missing).toEqual([])
  })

  it('forwards callables as callables', () => {
    const notCallable = PUBLISHED
      .filter(name => name !== 'IDENTITY')
      .filter(name => typeof (imageFix as Record<string, unknown>)[name] !== 'function')

    expect(notCallable).toEqual([])
    expect(imageFix.IDENTITY).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('no longer exports sniffFormat', () => {
    expect(Object.keys(imageFix)).not.toContain('sniffFormat')
  })

  it('still aligns a page end to end through the forwarded surface', async () => {
    const page = imageFix.createSyntheticDocument({ width: 400, height: 520, seed: 9 })
    const result = await imageFix.alignScan(page.raster, page.raster, { output: 'none' })

    expect(result.confidence).toBeGreaterThan(0.9)
    expect(result.width).toBe(400)
  }, 60_000)
})

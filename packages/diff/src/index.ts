/**
 * `@scanmate/diff` - what changed between an original and its aligned scan, and where.
 *
 * Every function here assumes both images already share a canvas - which is what
 * `@scanmate/align` produces. Feed it a raw scan and every rectangle names a
 * different part of the page in each image.
 */

export { compareRegions, diffDocument, renderDiff } from './region-comparison'
export type { DocumentDiff, Region, RegionOptions, RegionReport } from './region-comparison'

/** Which known rectangles gained ink, what changed page-wide, and an overlay to look at. */

export { compareRegions, diffDocument } from './compare-regions.use-case'
export type { DocumentDiff, Region, RegionOptions, RegionReport } from './region.model'
export { renderDiff } from './render-diff.use-case'

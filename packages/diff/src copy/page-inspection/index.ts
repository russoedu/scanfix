/** What a page says about itself - size, text, images, whether it is a scan - without rendering it. */

export { inspectPage } from './inspect-page.use-case'
export { classifyPage, SCAN_COVERAGE } from './page-kind.policy'
export type { PageEvidence } from './page-kind.policy'
export type { EmbeddedImage, PageKind, PageMetadata } from './page-metadata.contract'

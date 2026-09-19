/** Rasterising a page, at a resolution chosen from what the page is. */

export { DEFAULT_DPI_LIMITS, nativeDpi, pageDpi, pairDpi } from './render-dpi.policy'
export type { DpiChoice, DpiLimits } from './render-dpi.policy'
export { renderPage } from './render-page.client'
export type { RenderOptions } from './render-page.client'

/** What changed on a page and whether it was supposed to: changed pixels grouped into reportable regions. */

export { annotateOverlay, IDENTIFIED, NOT_IDENTIFIED, UNEXPECTED } from './annotate-overlay.use-case'
export type { Annotation, Rgba } from './annotate-overlay.use-case'
export { connectedComponents } from './connected-components.use-case'
export type { Component, LabelOptions } from './connected-components.use-case'
export { diffPage, diffPages } from './diff-pages.use-case'
export { mergeBoxes } from './merge-boxes.use-case'
export type { MergedBox } from './merge-boxes.use-case'
export type { Change, CoordinateUnits, DiffOptions, ExpectedChange, ExpectedResult, PageDiff } from './page-diff.contract'

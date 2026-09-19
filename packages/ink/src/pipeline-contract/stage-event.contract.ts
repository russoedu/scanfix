/**
 * Progress, reported the same way by every stage.
 *
 * One shape, defined once, so that an orchestrator can forward every stage's
 * progress to one callback without adapting five different signatures. It is
 * also the only logging seam: a published package never imports an application's
 * logger, it reports here and lets the host decide what a log line looks like.
 */

export type PipelineStage = 'merge' | 'extract' | 'align' | 'enhance' | 'ocr' | 'diff' | 'find'

export interface StageEvent {
  stage:       PipelineStage
  /** `start` before a page is worked on, `done` after. */
  phase:       'start' | 'done'
  /** One-based page number in the original document. */
  page:        number
  /** One-based position in this run, and how many pages the run holds. */
  index:       number
  total:       number
  /** Milliseconds the page took. Present on `done` only. */
  durationMs?: number
  /** Stage-specific facts worth logging, e.g. the model an alignment settled on. */
  detail?:     Readonly<Record<string, unknown>>
}

/** Receives {@link StageEvent}s. Must not throw; a thrown error aborts the stage. */
export type ProgressCallback = (event: StageEvent) => void

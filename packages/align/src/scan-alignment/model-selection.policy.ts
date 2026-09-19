import type { TransformModel } from '@scanmate/ink'

/**
 * Which transform to believe, when more than one fits.
 *
 * More degrees of freedom always fit at least as well, so a plain "highest
 * confidence wins" would drift towards the most flexible model on every input.
 * On a flatbed scan that is wrong in a way nothing downstream would notice: a
 * homography fitted to a flat page bends slightly to follow the page's own noise,
 * beats the similarity on ink correlation by a hair, passes `isPlausible`, and
 * puts every region a pixel or two off. So a more complex model has to *earn* its
 * extra parameters by a margin, and a simpler one within that margin is kept.
 */

/** Ascending cost, ascending fragility: the order a sweep should try them in. */
export const DEFAULT_MODELS: readonly TransformModel[] = ['similarity', 'affine', 'homography']

const DEGREES_OF_FREEDOM: Readonly<Record<TransformModel, number>> = {
  similarity: 4,
  affine:     6,
  homography: 8,
}

/** A fitted model and how well it did. */
export interface ScoredModel {
  model:      TransformModel
  confidence: number
}

/**
 * Should `candidate` replace `incumbent` as the answer?
 *
 * - A more complex candidate must beat the incumbent by more than `margin`.
 * - A simpler candidate wins if it comes within `margin` of the incumbent.
 * - An equally complex one simply has to do better.
 *
 * Symmetric on purpose, so the answer does not depend on the order the models
 * were tried in: whatever order `models` names, the simplest model within the
 * margin of the best is the one returned.
 */
export function prefers (candidate: ScoredModel, incumbent: ScoredModel | null, margin: number): boolean {
  if (incumbent === null) return true

  const extra = DEGREES_OF_FREEDOM[candidate.model] - DEGREES_OF_FREEDOM[incumbent.model]
  if (extra > 0) return candidate.confidence > incumbent.confidence + margin
  if (extra < 0) return candidate.confidence >= incumbent.confidence - margin

  return candidate.confidence > incumbent.confidence
}

/** The models to sweep, in the order given, each once. Throws on an empty list rather than silently fitting nothing. */
export function sweepOrder (models: readonly TransformModel[]): TransformModel[] {
  const unique = [...new Set(models)]
  if (unique.length === 0) throw new RangeError('models must name at least one transform model')

  return unique
}

/** How alike two texts are, measured the several ways they can differ. */

export { compareTexts } from './compare-texts.use-case'
export type { ScoreMetric, TextMetrics } from './compare-texts.use-case'
export { cosine, dice, jaccard, jaroWinkler, levenshtein, levenshteinSimilarity, wordDistance, wordRecall } from './similarity-metrics.use-case'

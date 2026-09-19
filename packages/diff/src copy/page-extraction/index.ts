/** One PDF to pages, or an original and its scan to comparable page pairs. */

export { extractPair, extractPairStream } from './extract-pair.use-case'
export { extractPages, extractPageStream } from './extract-pages.use-case'
export type { ExtractedPage, ExtractOptions, ExtractPairOptions, PairedDocument, PairedPage } from './extract-result.contract'
export { planPairs } from './page-pairing.policy'
export type { PagePairing, PairingPlan } from './page-pairing.policy'
export { selectPages } from './page-selection.mapper'
export type { PageSelection } from './page-selection.mapper'

import type { Change, ExpectedResult } from '@scanmate/diff'
import type { Rect } from '@scanmate/ink'
import type { TextDifference } from '@scanmate/ocr'

/**
 * One thing on a page someone should look at, with every piece of evidence for it.
 *
 * - `unexpected-mark`: ink added where nothing was expected; any words read
 *   there are attached.
 * - `missing-ink`: printed ink the scan lost; any text read as missing there is
 *   attached.
 * - `text-changed`, `text-missing`, `text-added`: the reading disagrees with the
 *   original where the pixels saw nothing - typically a substituted character,
 *   which stays within the pixel tolerance.
 * - `expected-empty`, `expected-overfilled`: a region that should have been
 *   filled in was left empty, or was blacked out.
 * - `content-missing`, `content-not-identifiable`: required content was not on
 *   its page, or not at every place the original prints it.
 */
export type FindingKind =
  'unexpected-mark' |
  'missing-ink' |
  'text-changed' |
  'text-missing' |
  'text-added' |
  'expected-empty' |
  'expected-overfilled' |
  'content-missing' |
  'content-not-identifiable'

export interface AuditFinding {
  kind:         FindingKind
  /** Where, in points from the page's top-left; `null` for content the original never places. */
  box:          Rect | null
  /** Both the reading and the pixels saw it - the strongest kind of finding. */
  corroborated: boolean
  /** One sentence for whoever reviews it. */
  summary:      string
  /** What the text comparison found here. */
  text:         TextDifference[]
  /** What the pixel comparison found here: a change, or an expected region's result. */
  pixels:       Change | ExpectedResult | null
  /** The expected region, or the required content, it concerns. */
  subject?:     string
}

/** A text difference that needs no one's attention, and why. */
export interface ExplainedDifference {
  difference: TextDifference
  /** The expected region that explains it: its own ink read as words, or its label written over. */
  region:     string
}

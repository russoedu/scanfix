/**
 * `@scanmate/audit` - the final audit of a returned document: read in full,
 * compared pixel by pixel, one verdict.
 *
 * ```ts
 * import { extractPair } from '@scanmate/extract'
 * import { alignPages } from '@scanmate/align'
 * import { auditPages } from '@scanmate/audit'
 *
 * const { pages } = await extractPair({ original: 'contract.pdf', scanned: 'returned.pdf' })
 * const audit = await auditPages(await alignPages(pages), {
 *   expected: [{ page: 6, id: 'signature', x: 82, y: 223, width: 480, height: 40 }],
 *   content:  [{ page: 1, content: ['The Resistance', '27,211,380.00'] }],
 * })
 * audit.verdict                    // 'pass' | 'review'
 * audit.pages[0].reasons           // why, one sentence each
 * audit.pages[0].findings          // text and pixel findings, merged by place
 * audit.pages[0].evidenceImage     // original and scan side by side, findings drawn on both
 * ```
 *
 * The reading (`@scanmate/ocr`) sees what changes the words; the pixel
 * comparison (`@scanmate/diff`) sees what changes the ink. A substituted digit
 * stays inside the pixel tolerance; a signature is not text. So both run, their
 * findings are merged by place, and what both saw is marked corroborated.
 */

export { auditPages } from './page-audit'
export type { AuditOptions, AuditReport, PageAudit, Verdict } from './page-audit'
export type { AuditFinding, ExplainedDifference, FindingKind } from './finding-correlation'

// --- Building blocks ---

export { correlateFindings } from './finding-correlation'
export type { Correlation, CorrelationInput } from './finding-correlation'
export { renderEvidence, TEXT_DIFFERENCE } from './audit-evidence'

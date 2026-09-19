/** Text and pixel differences made into one list of findings, each with all its evidence. */

export type { AuditFinding, ExplainedDifference, FindingKind } from './audit-finding.contract'
export { correlateFindings } from './correlate-findings.use-case'
export type { Correlation, CorrelationInput } from './correlate-findings.use-case'

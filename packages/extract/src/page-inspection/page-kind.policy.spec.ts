import { classifyPage, SCAN_COVERAGE } from './page-kind.policy'

describe('classifyPage', () => {
  it.each([
    { imageCoverage: 1, characterCount: 0, drawsPaths: false, kind: 'scanned' },
    { imageCoverage: 1, characterCount: 40, drawsPaths: false, kind: 'scanned-with-text-layer' },
    { imageCoverage: SCAN_COVERAGE, characterCount: 0, drawsPaths: false, kind: 'scanned' },
    { imageCoverage: 0.012, characterCount: 844, drawsPaths: true, kind: 'vector' },
    { imageCoverage: 0.5, characterCount: 0, drawsPaths: false, kind: 'vector' },
    { imageCoverage: 0, characterCount: 0, drawsPaths: true, kind: 'vector' },
    { imageCoverage: 0, characterCount: 0, drawsPaths: false, kind: 'empty' },
  ] as const)('coverage $imageCoverage, $characterCount chars, paths $drawsPaths -> $kind', ({ kind, ...evidence }) => {
    expect(classifyPage(evidence)).toBe(kind)
  })
})

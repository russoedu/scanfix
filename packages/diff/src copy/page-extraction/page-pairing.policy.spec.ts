import { planPairs } from './page-pairing.policy'

describe('planPairs', () => {
  it('pairs page n with page n', () => {
    expect(planPairs(3, 3, 'index')).toEqual({
      pairs:    [[1, 1], [2, 2], [3, 3]],
      unpaired: { original: [], scanned: [] },
    })
  })

  it('reports a page the scan lost', () => {
    expect(planPairs(3, 2, 'index').unpaired).toEqual({ original: [3], scanned: [] })
  })

  it('reports a page the scan gained, such as a cover sheet', () => {
    expect(planPairs(2, 3, 'index').unpaired).toEqual({ original: [], scanned: [3] })
  })

  it('follows explicit pairs, and reports whatever they leave out', () => {
    // The scan came back with a cover sheet first.
    const plan = planPairs(2, 3, [[1, 2], [2, 3]])

    expect(plan.pairs).toEqual([[1, 2], [2, 3]])
    expect(plan.unpaired).toEqual({ original: [], scanned: [1] })
  })

  it('refuses an explicit pair that names a page that does not exist', () => {
    expect(() => planPairs(2, 2, [[1, 3]])).toThrow(/scanned page 3 is outside/)
    expect(() => planPairs(2, 2, [[0, 1]])).toThrow(/original page 0 is outside/)
  })
})

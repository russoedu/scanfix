import { DEFAULT_MODELS, prefers, sweepOrder } from './model-selection.policy'

describe('prefers', () => {
  it('takes anything over nothing', () => {
    expect(prefers({ model: 'homography', confidence: 0.1 }, null, 0.02)).toBe(true)
  })

  it('makes a more complex model beat a simpler one by more than the margin', () => {
    const similarity = { model: 'similarity' as const, confidence: 0.9 }

    expect(prefers({ model: 'affine', confidence: 0.915 }, similarity, 0.02)).toBe(false)
    expect(prefers({ model: 'affine', confidence: 0.919 }, similarity, 0.02)).toBe(false)
    expect(prefers({ model: 'affine', confidence: 0.921 }, similarity, 0.02)).toBe(true)
  })

  it('lets a simpler model back in when it comes within the margin', () => {
    const homography = { model: 'homography' as const, confidence: 0.9 }

    expect(prefers({ model: 'similarity', confidence: 0.885 }, homography, 0.02)).toBe(true)
    expect(prefers({ model: 'similarity', confidence: 0.879 }, homography, 0.02)).toBe(false)
  })

  it('makes an equally complex model simply do better', () => {
    const affine = { model: 'affine' as const, confidence: 0.9 }

    expect(prefers({ model: 'affine', confidence: 0.9 }, affine, 0.02)).toBe(false)
    expect(prefers({ model: 'affine', confidence: 0.901 }, affine, 0.02)).toBe(true)
  })

  it('reaches the same answer whichever order the models arrive in', () => {
    const scores = [
      { model: 'similarity' as const, confidence: 0.95 },
      { model: 'affine' as const, confidence: 0.96 },
      { model: 'homography' as const, confidence: 0.962 },
    ]
    const winner = (order: typeof scores) => {
      let best: (typeof scores)[number] | null = null
      for (const candidate of order) if (prefers(candidate, best, 0.02)) best = candidate

      return best?.model
    }

    expect(winner(scores)).toBe('similarity')
    expect(winner([scores[2], scores[1], scores[0]])).toBe('similarity')
    expect(winner([scores[1], scores[2], scores[0]])).toBe('similarity')
  })
})

describe('sweepOrder', () => {
  it('defaults to cheapest and most robust first', () => {
    expect(sweepOrder(DEFAULT_MODELS)).toEqual(['similarity', 'affine', 'homography'])
  })

  it('keeps the given order and drops repeats', () => {
    expect(sweepOrder(['homography', 'similarity', 'homography'])).toEqual(['homography', 'similarity'])
  })

  it('refuses an empty list', () => {
    expect(() => sweepOrder([])).toThrow(/at least one/)
  })
})

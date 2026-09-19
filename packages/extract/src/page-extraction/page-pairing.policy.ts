/**
 * Which page of the scan goes with which page of the original.
 *
 * Scans lose pages, gain cover sheets and come back out of order, so pairing is
 * a decision the caller can make explicitly rather than something assumed. By
 * default page n pairs with page n. Pages left without a partner are reported,
 * never silently dropped: a missing page is one of the things a returned
 * document is checked for.
 */

/** `'index'` pairs page n with page n; a list names `[originalPage, scannedPage]` pairs explicitly. */
export type PagePairing = 'index' | ReadonlyArray<readonly [number, number]>

export interface PairingPlan {
  pairs:    Array<[number, number]>
  unpaired: { original: number[], scanned: number[] }
}

export function planPairs (originalCount: number, scannedCount: number, pairing: PagePairing): PairingPlan {
  const pairs: Array<[number, number]> = pairing === 'index'
    ? Array.from({ length: Math.min(originalCount, scannedCount) }, (_, i) => [i + 1, i + 1])
    : pairing.map(([original, scanned]) => {
        check(original, originalCount, 'original')
        check(scanned, scannedCount, 'scanned')

        return [original, scanned]
      })

  const usedOriginal = new Set(pairs.map(([o]) => o))
  const usedScanned = new Set(pairs.map(([, s]) => s))

  return {
    pairs,
    unpaired: {
      original: range(originalCount).filter(p => !usedOriginal.has(p)),
      scanned:  range(scannedCount).filter(p => !usedScanned.has(p)),
    },
  }
}

function check (page: number, count: number, side: string): void {
  if (!Number.isSafeInteger(page) || page < 1 || page > count)
    throw new RangeError(`${side} page ${page} is outside a ${count}-page document`)
}

function range (count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1)
}

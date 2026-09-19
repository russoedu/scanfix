import { selectPages } from './page-selection.mapper'

describe('selectPages', () => {
  it('selects every page by default', () => {
    expect(selectPages(undefined, 4)).toEqual([1, 2, 3, 4])
  })

  it('reads a print-dialog range string', () => {
    expect(selectPages('1-3, 5', 8)).toEqual([1, 2, 3, 5])
    expect(selectPages('6-', 8)).toEqual([6, 7, 8])
    expect(selectPages('-2', 8)).toEqual([1, 2])
  })

  it('sorts and de-duplicates a list', () => {
    expect(selectPages([3, 1, 3], 4)).toEqual([1, 3])
  })

  it('refuses a page the document does not have, rather than dropping it', () => {
    expect(() => selectPages([9], 8)).toThrow(/outside a 8-page document/)
    expect(() => selectPages('7-9', 8)).toThrow(/outside/)
    expect(() => selectPages([0], 8)).toThrow(/outside/)
  })

  it('refuses a range it cannot read', () => {
    expect(() => selectPages('two', 8)).toThrow(/cannot read/)
    expect(() => selectPages('5-2', 8)).toThrow(/backwards/)
  })
})

import { describe, expect, it } from 'vitest'
import { linkNames, type LibraryLookup } from './LibraryLookup'

describe('linkNames', () => {
  it('finds dishes and categories by id', () => {
    const lookup = {
      dishes: [{ id: 1, name: 'Idli' }],
      baseCategories: [{ id: 2, name: 'Rice-based' }],
      extraCategories: [{ id: 3, name: 'Soup' }],
      rules: [],
      loaded: true,
    } as unknown as LibraryLookup
    const names = linkNames(lookup)
    expect(names.component?.(1)).toBe('Idli')
    expect(names.baseCategory?.(2)).toBe('Rice-based')
    expect(names.extraCategory?.(3)).toBe('Soup')
    expect(names.component?.(9)).toBeUndefined()
  })
})

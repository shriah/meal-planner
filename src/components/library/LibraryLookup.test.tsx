import { describe, expect, it } from 'vitest'
import { linkNames, type LibraryLookup } from './LibraryLookup'

describe('linkNames', () => {
  it('finds dishes, categories of every part and parts by id, and the first part', () => {
    const lookup = {
      dishes: [{ id: 1, name: 'Idli' }],
      baseCategories: [{ id: 2, name: 'Rice-based', kind: 'base', part_id: 5 }],
      extraCategories: [{ id: 3, name: 'Soup', kind: 'extra', part_id: 4 }],
      categories: [
        { id: 2, name: 'Rice-based', kind: 'base', part_id: 5 },
        { id: 3, name: 'Soup', kind: 'extra', part_id: 4 },
        { id: 6, name: 'lentil', kind: 'curry', part_id: 7 },
      ],
      rules: [],
      parts: [{ id: 5, name: 'Base' }, { id: 7, name: 'Curry' }, { id: 4, name: 'Extras' }],
      loaded: true,
    } as unknown as LibraryLookup
    const names = linkNames(lookup)
    expect(names.component?.(1)).toBe('Idli')
    expect(names.baseCategory?.(2)).toBe('Rice-based')
    expect(names.extraCategory?.(3)).toBe('Soup')
    expect(names.category?.(6)).toBe('lentil')
    expect(names.categoryPart?.(3)).toBe(4)
    // The curry types read before the noun ("lentil curries"); other categories do not.
    expect(names.categoryIsType?.(6)).toBe(true)
    expect(names.categoryIsType?.(2)).toBe(false)
    expect(names.part?.(4)).toBe('Extras')
    expect(names.firstPart).toBe(5)
    expect(names.component?.(9)).toBeUndefined()
  })
})

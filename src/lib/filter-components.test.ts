import { describe, it, expect } from 'vitest'
import { filterComponents } from './filter-components'
import type { ComponentRecord } from '@/types/component'

// Inline test fixtures with known tag values
const fixtures: ComponentRecord[] = [
  {
    id: 1,
    name: 'Steamed Rice',
    componentType: 'base',
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['south-indian', 'pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '2026-01-01T00:00:00Z',
    base_type: 'rice-based',
  },
  {
    id: 2,
    name: 'Dal Tadka',
    componentType: 'curry',
    dietary_tags: ['veg'],
    protein_tag: 'dal',
    regional_tags: ['north-indian', 'pan-indian'],
    occasion_tags: ['everyday'],
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 3,
    name: 'Dal Makhani',
    componentType: 'curry',
    dietary_tags: ['veg'],
    protein_tag: 'dal',
    regional_tags: ['north-indian'],
    occasion_tags: ['weekend', 'festive'],
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 4,
    name: 'Chicken Curry',
    componentType: 'curry',
    dietary_tags: ['non-veg'],
    protein_tag: 'chicken',
    regional_tags: ['coastal-konkan', 'pan-indian'],
    occasion_tags: ['everyday', 'weekend'],
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 5,
    name: 'Methi Subzi',
    componentType: 'subzi',
    dietary_tags: ['veg', 'jain'],
    protein_tag: 'none',
    regional_tags: ['north-indian'],
    occasion_tags: ['everyday', 'fasting'],
    created_at: '2026-01-01T00:00:00Z',
  },
]

describe('filterComponents', () => {
  it('returns all components when no search text and no tags active', () => {
    const result = filterComponents(fixtures, '', [], [])
    expect(result).toHaveLength(fixtures.length)
    expect(result).toEqual(fixtures)
  })

  it('filters by name case-insensitively', () => {
    const result = filterComponents(fixtures, 'rice', [], [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Steamed Rice')
  })

  it('filters by partial name match', () => {
    const result = filterComponents(fixtures, 'dal', [], [])
    expect(result).toHaveLength(2)
    const names = result.map(r => r.name)
    expect(names).toContain('Dal Tadka')
    expect(names).toContain('Dal Makhani')
  })

  it('filters by single dietary tag', () => {
    const result = filterComponents(fixtures, '', ['veg'], [])
    expect(result.length).toBeGreaterThan(0)
    result.forEach(c => {
      expect(c.dietary_tags).toContain('veg')
    })
  })

  it('filters by single regional tag', () => {
    const result = filterComponents(fixtures, '', [], ['south-indian'])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Steamed Rice')
  })

  it('ANDs dietary and regional tags', () => {
    const result = filterComponents(fixtures, '', ['veg'], ['north-indian'])
    expect(result.length).toBeGreaterThan(0)
    result.forEach(c => {
      expect(c.dietary_tags).toContain('veg')
      expect(c.regional_tags).toContain('north-indian')
    })
    // Chicken Curry (non-veg) should be excluded
    const names = result.map(r => r.name)
    expect(names).not.toContain('Chicken Curry')
    // Steamed Rice (south-indian only) should be excluded
    expect(names).not.toContain('Steamed Rice')
  })

  it('ANDs multiple dietary tags', () => {
    const result = filterComponents(fixtures, '', ['veg', 'jain'], [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Methi Subzi')
    result.forEach(c => {
      expect(c.dietary_tags).toContain('veg')
      expect(c.dietary_tags).toContain('jain')
    })
  })

  it('returns empty array for no matches', () => {
    const result = filterComponents(fixtures, 'xyznonexistent', [], [])
    expect(result).toHaveLength(0)
  })

  it('combines search text with tag filters', () => {
    const result = filterComponents(fixtures, 'rice', ['veg'], [])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Steamed Rice')
    expect(result[0].dietary_tags).toContain('veg')
  })
})

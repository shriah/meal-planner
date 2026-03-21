import { describe, it, expect } from 'vitest'
import { describeRule } from './ruleDescriptions'

describe('describeRule', () => {
  it('day-filter: single day with protein tag', () => {
    expect(
      describeRule({ type: 'day-filter', days: ['friday'], slots: null, filter: { protein_tag: 'fish' } })
    ).toBe('On Friday: protein fish')
  })

  it('day-filter: multiple days with slots and occasion tag', () => {
    expect(
      describeRule({
        type: 'day-filter',
        days: ['saturday', 'sunday'],
        slots: ['lunch', 'dinner'],
        filter: { occasion_tag: 'weekend' },
      })
    ).toBe('On Saturday, Sunday (lunch, dinner): occasion weekend')
  })

  it('day-filter: single day no tags returns any meal', () => {
    expect(
      describeRule({ type: 'day-filter', days: ['monday'], slots: null, filter: {} })
    ).toBe('On Monday: any meal')
  })

  it('no-repeat: subzi variant', () => {
    expect(
      describeRule({ type: 'no-repeat', component_type: 'subzi', within: 'week' })
    ).toBe('No repeated subzi within the week')
  })

  it('require-component: single day no slots', () => {
    expect(
      describeRule({ type: 'require-component', component_id: 5, days: ['friday'], slots: null })
    ).toBe('Require specific component on Friday')
  })

  it('require-component: multiple days with slot', () => {
    expect(
      describeRule({
        type: 'require-component',
        component_id: 5,
        days: ['monday', 'wednesday'],
        slots: ['dinner'],
      })
    ).toBe('Require specific component on Monday, Wednesday (dinner)')
  })

  it('day-filter: multiple tags both appear in output', () => {
    const result = describeRule({
      type: 'day-filter',
      days: ['friday'],
      slots: null,
      filter: { dietary_tag: 'non-veg', protein_tag: 'fish' },
    })
    expect(result).toContain('dietary non-veg')
    expect(result).toContain('protein fish')
  })
})

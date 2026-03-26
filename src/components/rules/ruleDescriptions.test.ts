import { describe, it, expect } from 'vitest'
import { describeRule } from './ruleDescriptions'

describe('describeRule', () => {
  it('no-repeat: subzi variant', () => {
    expect(
      describeRule({ type: 'no-repeat', component_type: 'subzi', within: 'week' })
    ).toBe('No repeated subzi within the week')
  })

  it('scheduling-rule: filter-pool with tag match on specific day', () => {
    expect(
      describeRule({
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['friday'],
        slots: null,
        match: { mode: 'tag', filter: { protein_tag: 'fish' } },
      })
    ).toBe('Filter pool on Friday: protein: fish')
  })

  it('scheduling-rule: require-one with component match on multiple days', () => {
    expect(
      describeRule({
        type: 'scheduling-rule',
        effect: 'require-one',
        days: ['monday', 'wednesday'],
        slots: ['dinner'],
        match: { mode: 'component', component_id: 5 },
      })
    ).toBe('Require one on Monday, Wednesday (dinner): component #5')
  })

  it('scheduling-rule: exclude with no days (all days)', () => {
    expect(
      describeRule({
        type: 'scheduling-rule',
        effect: 'exclude',
        days: null,
        slots: null,
        match: { mode: 'tag', filter: { dietary_tag: 'non-veg' } },
      })
    ).toBe('Exclude: dietary: non-veg')
  })

  it('scheduling-rule: filter-pool with multiple tags', () => {
    const result = describeRule({
      type: 'scheduling-rule',
      effect: 'filter-pool',
      days: ['friday'],
      slots: null,
      match: { mode: 'tag', filter: { dietary_tag: 'non-veg', protein_tag: 'fish' } },
    })
    expect(result).toContain('dietary: non-veg')
    expect(result).toContain('protein: fish')
  })

  it('scheduling-rule: filter-pool with empty tag filter returns any tag', () => {
    expect(
      describeRule({
        type: 'scheduling-rule',
        effect: 'filter-pool',
        days: ['monday'],
        slots: null,
        match: { mode: 'tag', filter: {} },
      })
    ).toBe('Filter pool on Monday: any tag')
  })

  it('meal-template: base selector with allowed_slots', () => {
    expect(
      describeRule({
        type: 'meal-template',
        selector: { mode: 'base', base_type: 'rice-based' },
        days: null,
        slots: null,
        allowed_slots: ['lunch', 'dinner'],
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      })
    ).toBe('Rice-based: allowed at lunch, dinner')
  })

  it('meal-template: tag selector with protein tag', () => {
    expect(
      describeRule({
        type: 'meal-template',
        selector: { mode: 'tag', filter: { protein_tag: 'fish' } },
        days: null,
        slots: null,
        allowed_slots: null,
        exclude_component_types: ['curry'],
        exclude_extra_categories: [],
        require_extra_category: null,
      })
    ).toBe('Tag: protein: fish: exclude curry')
  })

  it('meal-template: component selector', () => {
    expect(
      describeRule({
        type: 'meal-template',
        selector: { mode: 'component', component_id: 42 },
        days: null,
        slots: null,
        allowed_slots: null,
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: 'liquid',
      })
    ).toBe('Component #42: require liquid extra')
  })

  it('meal-template: base selector with no parts returns just selector label', () => {
    expect(
      describeRule({
        type: 'meal-template',
        selector: { mode: 'base', base_type: 'bread-based' },
        days: null,
        slots: ['lunch'],
        allowed_slots: null,
        exclude_component_types: [],
        exclude_extra_categories: [],
        require_extra_category: null,
      })
    ).toBe('Bread-based (lunch)')
  })
})

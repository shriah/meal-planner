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
})

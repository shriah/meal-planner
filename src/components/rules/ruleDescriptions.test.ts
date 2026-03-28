import { describe, it, expect } from 'vitest'
import { describeRule } from './ruleDescriptions'
import type { CompiledRule } from '@/types/plan'

function rule(partial: Omit<CompiledRule, 'type'>): CompiledRule {
  return { type: 'rule', ...partial }
}

describe('describeRule', () => {
  it('describes a no-repeat rule', () => {
    expect(describeRule(rule({
      target: { mode: 'component_type', component_type: 'base' },
      scope: { days: null, slots: null },
      effects: [{ kind: 'no_repeat' }],
    }))).toBe('all bases: No-repeat')
  })

  it('describes a filter_pool rule with tag and day scope', () => {
    expect(describeRule(rule({
      target: { mode: 'tag', filter: { protein_tag: 'fish' } },
      scope: { days: ['friday'], slots: null },
      effects: [{ kind: 'filter_pool' }],
    }))).toBe('protein: fish on Friday: Filter pool')
  })

  it('describes an exclude rule with component target', () => {
    expect(describeRule(rule({
      target: { mode: 'component', component_id: 5 },
      scope: { days: null, slots: ['breakfast'] },
      effects: [{ kind: 'exclude' }],
    }))).toBe('component #5 (breakfast): Exclude')
  })

  it('describes a rice template with composition effects', () => {
    expect(describeRule(rule({
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'allowed_slots', slots: ['lunch', 'dinner'] },
        { kind: 'skip_component', component_types: ['curry'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    }))).toBe('Rice-based: allowed at lunch, dinner; skip curry; require condiment extra')
  })

  it('ignores legacy exclude-extra effects in user-facing copy', () => {
    expect(describeRule(rule({
      target: { mode: 'base_type', base_type: 'rice-based' },
      scope: { days: null, slots: null },
      effects: [
        { kind: 'exclude_extra', categories: ['sweet'] },
        { kind: 'require_extra', categories: ['condiment'] },
      ],
    } as CompiledRule))).toBe('Rice-based: require condiment extra')
  })

  it('describes a rule with no effects', () => {
    expect(describeRule(rule({
      target: { mode: 'base_type', base_type: 'bread-based' },
      scope: { days: null, slots: null },
      effects: [],
    }))).toBe('Bread-based')
  })
})

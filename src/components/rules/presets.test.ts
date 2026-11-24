import { describe, expect, it } from 'vitest'
import { is } from '@/planner'
import { describeSpec, libraryNames, parseSpec } from '@/rules'
import { rulePresets } from './presets'

// The converted parts renamed and out of id order: presets find Subzi and Curry by `legacy`.
const PARTS = [
  { id: 9, name: 'Base', legacy: 'base' as const },
  { id: 5, name: 'Curry', legacy: 'curry' as const },
  { id: 7, name: 'Subzi', legacy: 'subzi' as const },
  { id: 6, name: 'Extras', legacy: 'extra' as const },
]

describe('rule presets', () => {
  it('name the Subzi and Curry parts by id and read as before', () => {
    const presets = rulePresets(PARTS)
    const names = libraryNames({ dishes: [], categories: [], parts: PARTS })
    const read = (id: string) => {
      const parsed = parseSpec(presets.find((p) => p.id === id)!.spec)
      if (!parsed.ok) throw new Error(parsed.message)
      return describeSpec(parsed.spec, names)
    }
    expect(presets.find((p) => p.id === 'no-repeat-subzi')!.spec).toEqual({ template: 'no_repeat', params: { match: is('part', 7) } })
    expect(read('no-repeat-subzi')).toBe("Don't repeat subzis in the week")
    expect(read('curry-spacing')).toBe("Don't repeat curries within 3 days")
    expect(JSON.stringify(presets)).not.toMatch(/componentType/)
  })

  it('leave out a preset whose part the library does not have', () => {
    expect(rulePresets([{ id: 1, legacy: 'base' }]).map((p) => p.id)).toEqual(['fish-fridays', 'no-paneer-weekdays', 'non-veg-cap'])
  })
})

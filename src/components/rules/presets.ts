import { is } from '@/planner'
import type { PlannerPart } from '@/planner'
import type { RuleSpecInput } from '@/rules'

export interface RulePreset {
  id: string
  name: string
  spec: RuleSpecInput
}

/**
 * Ready-made rules users can add with one click, over the library's parts. A preset about the part that was Subzi or
 * Curry (found by `legacy`) is left out when the library has no such part.
 */
export function rulePresets(parts: readonly Pick<PlannerPart, 'id' | 'legacy'>[]): RulePreset[] {
  const partOf = (legacy: PlannerPart['legacy']) => parts.find((p) => p.legacy === legacy)?.id
  const subzi = partOf('subzi')
  const curry = partOf('curry')
  return [
    {
      id: 'fish-fridays',
      name: 'Fish on Fridays',
      spec: { template: 'limit', params: { match: is('protein_tag', 'fish'), per: 'day', min: 1, scope: { days: ['friday'] } } },
    },
    ...(subzi === undefined ? [] : [{
      id: 'no-repeat-subzi',
      name: 'No repeated subzi in the week',
      spec: { template: 'no_repeat', params: { match: is('part', subzi) } },
    } satisfies RulePreset]),
    ...(curry === undefined ? [] : [{
      id: 'curry-spacing',
      name: 'Same curry not within 3 days',
      spec: { template: 'no_repeat', params: { match: is('part', curry), within: 3 } },
    } satisfies RulePreset]),
    {
      id: 'no-paneer-weekdays',
      name: 'No paneer on weekdays',
      spec: { template: 'exclude', params: { match: is('protein_tag', 'paneer'), scope: { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] } } },
    },
    {
      id: 'non-veg-cap',
      name: 'At most 2 non-veg dishes a week',
      spec: { template: 'limit', params: { match: is('dietary_tags', 'non-veg'), per: 'week', max: 2 } },
    },
  ]
}

import { is } from '@/planner'
import type { RuleSpecInput } from '@/rules'

export interface RulePreset {
  id: string
  name: string
  spec: RuleSpecInput
}

/** Ready-made rules users can add with one click. */
export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'fish-fridays',
    name: 'Fish on Fridays',
    spec: { template: 'limit', params: { match: is('protein_tag', 'fish'), per: 'day', min: 1, scope: { days: ['friday'] } } },
  },
  {
    id: 'no-repeat-subzi',
    name: 'No repeated subzi in the week',
    spec: { template: 'no_repeat', params: { match: is('componentType', 'subzi') } },
  },
  {
    id: 'curry-spacing',
    name: 'Same curry not within 3 days',
    spec: { template: 'no_repeat', params: { match: is('componentType', 'curry'), within: 3 } },
  },
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

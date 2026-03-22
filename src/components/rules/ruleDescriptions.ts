import type { CompiledFilter } from '@/types/plan'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDays(days: string[]): string {
  return days.map(capitalize).join(', ')
}

function formatSlotsSuffix(slots: string[] | null): string {
  if (!slots || slots.length === 0) return ''
  return ` (${slots.join(', ')})`
}

export function describeRule(filter: CompiledFilter): string {
  switch (filter.type) {
    case 'day-filter': {
      const daysPart = formatDays(filter.days)
      const slotsSuffix = formatSlotsSuffix(filter.slots)

      const friendlyKeyMap: Record<string, string> = {
        dietary_tag: 'dietary',
        protein_tag: 'protein',
        regional_tag: 'regional',
        occasion_tag: 'occasion',
      }

      const tagEntries = Object.entries(filter.filter)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${friendlyKeyMap[key] ?? key} ${value}`)

      const tagsPart = tagEntries.length > 0 ? tagEntries.join(', ') : 'any meal'

      return `On ${daysPart}${slotsSuffix}: ${tagsPart}`
    }

    case 'no-repeat': {
      return `No repeated ${filter.component_type} within the week`
    }

    case 'require-component': {
      const daysPart = formatDays(filter.days)
      const slotsSuffix = formatSlotsSuffix(filter.slots)
      return `Require specific component on ${daysPart}${slotsSuffix}`
    }

    case 'scheduling-rule': {
      const effectLabel: Record<string, string> = {
        'filter-pool': 'Filter pool',
        'require-one': 'Require one',
        'exclude': 'Exclude',
      }
      const daysPart = filter.days && filter.days.length > 0 ? ` on ${formatDays(filter.days)}` : ''
      const slotsSuffix = formatSlotsSuffix(filter.slots)
      const matchDesc = filter.match.mode === 'tag'
        ? Object.entries(filter.match.filter).filter(([, v]) => Boolean(v)).map(([k, v]) => `${k.replace('_tag', '')}: ${v}`).join(', ') || 'any tag'
        : `component #${filter.match.component_id}`
      return `${effectLabel[filter.effect] ?? filter.effect}${daysPart}${slotsSuffix}: ${matchDesc}`
    }
  }
}

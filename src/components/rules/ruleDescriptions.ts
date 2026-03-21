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
  }
}

import type { CompiledFilter } from '@/types/plan'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDays(days: string[] | null): string {
  if (!days || days.length === 0) return 'all days'
  return days.map(capitalize).join(', ')
}

function formatSlotsSuffix(slots: string[] | null): string {
  if (!slots || slots.length === 0) return ''
  return ` (${slots.join(', ')})`
}

export function describeRule(filter: CompiledFilter): string {
  switch (filter.type) {
    case 'no-repeat': {
      return `No repeated ${filter.component_type} within the week`
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

    case 'meal-template': {
      let selectorLabel: string
      if (filter.selector.mode === 'base') {
        selectorLabel = capitalize(filter.selector.base_type)
      } else if (filter.selector.mode === 'tag') {
        const tagParts = Object.entries(filter.selector.filter)
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => `${k.replace('_tag', '')}: ${v}`)
          .join(', ')
        selectorLabel = `Tag: ${tagParts || 'any'}`
      } else {
        selectorLabel = `Component #${filter.selector.component_id}`
      }
      const parts: string[] = []

      // Slot assignment
      if (filter.allowed_slots !== null) {
        parts.push(`allowed at ${filter.allowed_slots.join(', ')}`)
      }

      // Component type exclusions
      if (filter.exclude_component_types.length > 0) {
        parts.push(`exclude ${filter.exclude_component_types.join(', ')}`)
      }

      // Extra category exclusions
      if (filter.exclude_extra_categories.length > 0) {
        const catLabel = filter.exclude_extra_categories.map(c => `${c} extras`).join(', ')
        // Merge with component exclusions if both present
        if (filter.exclude_component_types.length > 0) {
          parts.push(catLabel)
        } else {
          parts.push(`exclude ${catLabel}`)
        }
      }

      // Required extra
      if (filter.require_extra_category !== null) {
        parts.push(`require ${filter.require_extra_category} extra`)
      }

      // Context scope qualifier (slots in parens when present)
      const slotsQualifier = filter.slots !== null && filter.slots.length > 0
        ? ` (${filter.slots.join(', ')})`
        : ''

      if (parts.length === 0) {
        return `${selectorLabel}${slotsQualifier}`
      }

      return `${selectorLabel}${slotsQualifier}: ${parts.join(', ')}`
    }
  }
}

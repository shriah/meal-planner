import type { CompiledRule, Target, AnyEffect } from '@/types/plan'

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

function describeTarget(target: Target): string {
  switch (target.mode) {
    case 'component_type':
      return `all ${target.component_type}s`
    case 'tag': {
      const parts = Object.entries(target.filter)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k.replace('_tag', '')}: ${v}`)
      return parts.length > 0 ? parts.join(', ') : 'any tag'
    }
    case 'component':
      return `component #${target.component_id}`
    case 'base_type':
      return capitalize(target.base_type)
  }
}

function describeEffects(effects: AnyEffect[]): string {
  const parts: string[] = []

  const selection = effects.find(e =>
    e.kind === 'filter_pool' || e.kind === 'require_one' ||
    e.kind === 'exclude' || e.kind === 'no_repeat',
  )
  if (selection) {
    const labels: Record<string, string> = {
      filter_pool: 'Filter pool', require_one: 'Require one',
      exclude: 'Exclude', no_repeat: 'No-repeat',
    }
    parts.push(labels[selection.kind] ?? selection.kind)
  }

  for (const e of effects) {
    if (e.kind === 'allowed_slots')
      parts.push(`allowed at ${e.slots.join(', ')}`)
    if (e.kind === 'skip_component')
      parts.push(`skip ${e.component_types.join(', ')}`)
    if (e.kind === 'require_extra')
      parts.push(`require ${e.categories.join(', ')} extra`)
  }

  return parts.join('; ')
}

export function describeRule(rule: CompiledRule): string {
  const targetLabel = describeTarget(rule.target)
  const daysPart = rule.scope.days && rule.scope.days.length > 0
    ? ` on ${formatDays(rule.scope.days)}`
    : ''
  const slotsSuffix = formatSlotsSuffix(rule.scope.slots)
  const effectsLabel = describeEffects(rule.effects)

  if (!effectsLabel) return `${targetLabel}${daysPart}${slotsSuffix}`
  return `${targetLabel}${daysPart}${slotsSuffix}: ${effectsLabel}`
}

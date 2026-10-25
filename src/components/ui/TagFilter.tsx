'use client'

import { Badge } from '@/components/ui/badge'
import { DIETARY_TAGS, REGIONAL_TAGS, type DietaryTag, type RegionalTag } from '@/types/component'

interface TagFilterProps {
  dietary: readonly DietaryTag[]
  regional: readonly RegionalTag[]
  onToggleDietary: (tag: DietaryTag) => void
  onToggleRegional: (tag: RegionalTag) => void
  /** True for a tag that would match nothing; such a tag stays usable while it is active. */
  isDisabled?: (kind: 'dietary' | 'regional', tag: string) => boolean
}

/** Dietary and regional filter chips, operable by keyboard and screen reader. */
export function TagFilter({ dietary, regional, onToggleDietary, onToggleRegional, isDisabled }: TagFilterProps) {
  function chip<T extends string>(kind: 'dietary' | 'regional', tag: T, active: boolean, toggle: (tag: T) => void) {
    const disabled = !active && (isDisabled?.(kind, tag) ?? false)
    return (
      <Badge key={tag} asChild variant={active ? 'default' : 'outline'} className="cursor-pointer text-sm px-2 py-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
        <button type="button" aria-pressed={active} disabled={disabled} onClick={() => toggle(tag)}>
          {tag}
        </button>
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {DIETARY_TAGS.map(tag => chip('dietary', tag, dietary.includes(tag), onToggleDietary))}
      {REGIONAL_TAGS.map(tag => chip('regional', tag, regional.includes(tag), onToggleRegional))}
    </div>
  )
}

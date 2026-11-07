'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LINK_STRENGTHS, STRENGTH_WORDS, type LinkStrength, type LinkValue } from '@/rules'
import type { ComponentRecord } from '@/types/component'
import { OptionPicker } from './OptionPicker'

const GROUPS = [
  { type: 'curry', label: 'Curries' },
  { type: 'subzi', label: 'Subzis' },
  { type: 'extra', label: 'Extras' },
] as const

interface ServedWithPickerProps {
  baseName: string
  dishes: readonly ComponentRecord[]
  /** Dishes served with this base by name; ticking one adds the base to its own served-with link. */
  selected: number[]
  onChange: (selected: number[]) => void
  /** How firmly a newly ticked dish (one with no served-with link yet) is served. */
  strength: LinkStrength
  onStrengthChange: (strength: LinkStrength) => void
  /** Dishes served with the base's whole category; edited on those dishes, shown here for context. */
  viaCategory: { id: number; name: string }[]
}

/** The curries, subzis and extras added to a meal whenever this base is planned, picked from one list per kind. */
export function ServedWithPicker({ baseName, dishes, selected, onChange, strength, onStrengthChange, viaCategory }: ServedWithPickerProps) {
  const name = baseName.trim() || 'this base'
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold">Served with</legend>
      <p className="text-xs text-muted-foreground">Ticked dishes are added to the meal whenever {name} is planned.</p>
      {GROUPS.map(({ type, label }) => {
        const options = dishes.filter((d) => d.componentType === type).map((d) => ({ value: d.id, label: d.name }))
        if (options.length === 0) return null
        const ids = options.map((o) => o.value)
        return (
          <div key={type} role="group" aria-label={label} className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
            <OptionPicker
              options={options}
              selected={selected.filter((id) => ids.includes(id))}
              onChange={(next: LinkValue[]) => onChange([...selected.filter((id) => !ids.includes(id)), ...(next as number[])])}
            />
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="How firmly, new picks">
        <span className="mr-1 text-xs text-muted-foreground">New picks:</span>
        {LINK_STRENGTHS.map((s) => (
          <Button key={s} type="button" size="sm" variant={strength === s ? 'secondary' : 'outline'} aria-pressed={strength === s}
            onClick={() => onStrengthChange(s)}>
            {STRENGTH_WORDS[s].label}
          </Button>
        ))}
      </div>
      {viaCategory.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also served with its whole category:{' '}
          {viaCategory.map((d, i) => (
            <span key={d.id}>{i > 0 && ', '}<a className="underline" href={`/library#dish-${d.id}`}>{d.name}</a></span>
          ))}
        </p>
      )}
    </fieldset>
  )
}

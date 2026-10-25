'use client'

import { X } from 'lucide-react'
import { DAYS, MEALS, type Day, type Meal } from '@/planner'
import type { Scope } from '@/rules'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'

export interface Option<V extends string | number> {
  value: V
  label: string
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const DAY_OPTIONS: Option<Day>[] = DAYS.map((d) => ({ value: d, label: titleCase(d).slice(0, 3) }))
export const MEAL_OPTIONS: Option<Meal>[] = MEALS.map((m) => ({ value: m, label: titleCase(m) }))

/** Pick any number of options with toggle buttons. */
export function ToggleGroup<V extends string>({ label, options, value, onChange }: {
  label: string
  options: Option<V>[]
  value: readonly V[]
  onChange: (next: V[]) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Toggle
          key={o.value}
          variant="outline"
          pressed={value.includes(o.value)}
          onPressedChange={(on) => onChange(on ? options.map((x) => x.value).filter((v) => v === o.value || value.includes(v)) : value.filter((v) => v !== o.value))}
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {o.label}
        </Toggle>
      ))}
    </div>
  )
}

/** Chips for chosen values plus a searchable picker to add more. */
export function MultiPicker<V extends string | number>({ label, options, value, onChange, placeholder }: {
  label: string
  options: Option<V>[]
  value: readonly V[]
  onChange: (next: V[]) => void
  placeholder?: string
}) {
  const remaining: ComboboxOption[] = options
    .filter((o) => !value.includes(o.value))
    .map((o) => ({ value: String(o.value), label: o.label }))
  const labelOf = (v: V) => options.find((o) => o.value === v)?.label ?? `#${v}`

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
          {labelOf(v)}
          <button type="button" aria-label={`Remove ${labelOf(v)}`} onClick={() => onChange(value.filter((x) => x !== v))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {remaining.length > 0 && (
        <Combobox
          options={remaining}
          value=""
          placeholder={placeholder ?? 'Add…'}
          aria-label={`Add ${label.toLowerCase()}`}
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          onValueChange={(raw) => {
            const picked = options.find((o) => String(o.value) === raw)
            if (picked) onChange([...value, picked.value])
          }}
        />
      )}
    </div>
  )
}

/** Days and meals a rule applies to; nothing chosen means every day / every meal. */
export function ScopePicker({ value, onChange }: { value: Scope | undefined; onChange: (next: Scope | undefined) => void }) {
  const set = (patch: Partial<Scope>) => {
    const next = { ...value, ...patch }
    const cleaned: Scope = {
      ...(next.days?.length ? { days: next.days } : {}),
      ...(next.meals?.length ? { meals: next.meals } : {}),
    }
    onChange(cleaned.days || cleaned.meals ? cleaned : undefined)
  }
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Days (none = every day)</Label>
        <ToggleGroup label="Days" options={DAY_OPTIONS} value={value?.days ?? []} onChange={(days) => set({ days })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Meals (none = every meal)</Label>
        <ToggleGroup label="Meals" options={MEAL_OPTIONS} value={value?.meals ?? []} onChange={(meals) => set({ meals })} />
      </div>
    </div>
  )
}

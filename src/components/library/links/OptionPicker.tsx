'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LinkValue } from '@/rules'

export interface Option { value: LinkValue; label: string }

interface OptionPickerProps {
  options: Option[]
  selected: LinkValue[]
  onChange: (selected: LinkValue[]) => void
}

const SEARCH_FROM = 8

/** A checkbox list with search for long lists. Select all and Clear act on the options the search shows. */
export function OptionPicker({ options, selected, onChange }: OptionPickerProps) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = options.length > SEARCH_FROM && needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const shownValues = shown.map((o) => o.value)
  const toggle = (value: LinkValue) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <div className="space-y-2">
      {options.length > SEARCH_FROM && (
        <Input type="search" aria-label="Search options" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{selected.length} selected</span>
        <Button type="button" variant="ghost" size="xs" onClick={() => onChange([...selected, ...shownValues.filter((v) => !selected.includes(v))])}>
          Select all
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => onChange(selected.filter((v) => !shownValues.includes(v)))}>
          Clear
        </Button>
      </div>
      <div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto">
        {shown.map((o) => (
          <Label key={String(o.value)} className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
            {o.label}
          </Label>
        ))}
        {shown.length === 0 && <p className="text-xs text-muted-foreground">{options.length ? 'No matches.' : 'Nothing to pick yet.'}</p>}
      </div>
    </div>
  )
}

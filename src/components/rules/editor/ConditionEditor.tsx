'use client'

import { Plus, Trash2 } from 'lucide-react'
import { FIELDS, TRUE, type Matcher } from '@/planner'
import {
  CONDITION_FIELDS, describeMatcher, fromMatcher, toMatcher,
  type Condition, type ConditionField, type ConditionGroup, type ConditionValue, type Names,
} from '@/rules'
import type { ComponentRecord } from '@/types/component'
import type { CategoryRecord } from '@/types/category'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiPicker, type Option } from './widgets'

export interface EditorData {
  components: ComponentRecord[]
  baseCategories: CategoryRecord[]
  extraCategories: CategoryRecord[]
  names: Names
}

const FIELD_LABELS: Record<ConditionField, string> = {
  componentType: 'Type',
  id: 'Dish',
  base_category_id: 'Base category',
  extra_category_id: 'Extra category',
  dietary_tags: 'Dietary',
  protein_tag: 'Protein',
  regional_tags: 'Region',
  occasion_tags: 'Occasion',
  frequency: 'Frequency',
}

function valueOptions(field: ConditionField, data: EditorData): Option<ConditionValue>[] {
  switch (field) {
    case 'id':
      return [...data.components].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: `${c.name} (${c.componentType})` }))
    case 'base_category_id':
      return data.baseCategories.map((c) => ({ value: c.id, label: c.name }))
    case 'extra_category_id':
      return data.extraCategories.map((c) => ({ value: c.id, label: c.name }))
    default:
      return (FIELDS[field].options ?? []).map((o) => ({ value: o, label: o }))
  }
}

/** Edit a matcher as conditions joined by "all" or "any". */
export function ConditionEditor({ label, value, onChange, data }: {
  label: string
  value: Matcher
  onChange: (next: Matcher) => void
  data: EditorData
}) {
  const group = fromMatcher(value)

  if (!group) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
        <p>This condition is too complex to edit here: <span className="font-medium">{describeMatcher(value, data.names)}</span></p>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(TRUE)}>Replace with simple conditions</Button>
      </div>
    )
  }

  const update = (next: ConditionGroup) => onChange(toMatcher(next))
  const setCondition = (i: number, c: Condition) => update({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) })

  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {group.conditions.length > 1 && (
        <Select value={group.join} onValueChange={(join) => update({ ...group, join: join as ConditionGroup['join'] })}>
          <SelectTrigger className="w-56" aria-label={`${label}: how conditions combine`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Match all of these</SelectItem>
            <SelectItem value="any">Match any of these</SelectItem>
          </SelectContent>
        </Select>
      )}
      {group.conditions.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Select value={c.field} onValueChange={(field) => setCondition(i, { field: field as ConditionField, negate: c.negate, values: [] })}>
            <SelectTrigger className="w-36" aria-label={`Condition ${i + 1} field`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONDITION_FIELDS.map((f) => <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={c.negate ? 'not' : 'is'} onValueChange={(v) => setCondition(i, { ...c, negate: v === 'not' })}>
            <SelectTrigger className="w-24" aria-label={`Condition ${i + 1} operator`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="is">is</SelectItem>
              <SelectItem value="not">is not</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1 min-w-48">
            <MultiPicker
              label={FIELD_LABELS[c.field]}
              options={valueOptions(c.field, data)}
              value={c.values}
              onChange={(values) => setCondition(i, { ...c, values })}
              placeholder={c.values.length ? 'or…' : 'Choose…'}
            />
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove condition ${i + 1}`}
            onClick={() => update({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => update({ ...group, conditions: [...group.conditions, { field: 'componentType', negate: false, values: [] }] })}>
        <Plus className="h-4 w-4 mr-1" /> Add condition
      </Button>
    </div>
  )
}

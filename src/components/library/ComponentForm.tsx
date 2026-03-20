'use client'

import { useState } from 'react'
import { addComponent, updateComponent } from '@/services/food-db'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ComponentRecord,
  ComponentType,
  BaseType,
  ExtraCategory,
  DietaryTag,
  ProteinTag,
  RegionalTag,
  OccasionTag,
} from '@/types/component'

const DIETARY_TAGS: DietaryTag[] = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian']
const REGIONAL_TAGS: RegionalTag[] = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian']
const OCCASION_TAGS: OccasionTag[] = ['everyday', 'fasting', 'festive', 'weekend']
const BASE_TYPES: BaseType[] = ['rice-based', 'bread-based', 'other']
const EXTRA_CATEGORIES: { value: ExtraCategory; label: string }[] = [
  { value: 'liquid', label: 'Liquid' },
  { value: 'crunchy', label: 'Crunchy' },
  { value: 'condiment', label: 'Condiment' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'sweet', label: 'Sweet' },
]
const PROTEIN_TAGS: ProteinTag[] = ['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none']

const SINGULAR_LABEL: Record<ComponentType, string> = {
  base: 'Base',
  curry: 'Curry',
  subzi: 'Subzi',
  extra: 'Extra',
}

interface ComponentFormProps {
  component?: ComponentRecord
  componentType: ComponentType
  onSave: () => void
  onDiscard: () => void
  mode: 'edit' | 'add'
}

interface FormState {
  name: string
  base_type: BaseType
  extra_category: ExtraCategory
  compatible_base_types: BaseType[]
  dietary_tags: DietaryTag[]
  protein_tag: ProteinTag
  regional_tags: RegionalTag[]
  occasion_tags: OccasionTag[]
}

function initialFormState(component: ComponentRecord | undefined, componentType: ComponentType): FormState {
  if (component) {
    return {
      name: component.name,
      base_type: component.base_type ?? 'rice-based',
      extra_category: component.extra_category ?? 'liquid',
      compatible_base_types: component.compatible_base_types ?? [],
      dietary_tags: component.dietary_tags,
      protein_tag: component.protein_tag ?? 'none',
      regional_tags: component.regional_tags,
      occasion_tags: component.occasion_tags,
    }
  }
  return {
    name: '',
    base_type: 'rice-based',
    extra_category: 'liquid',
    compatible_base_types: [],
    dietary_tags: [],
    protein_tag: 'none',
    regional_tags: [],
    occasion_tags: [],
  }
}

function toggleArrayValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}

export function ComponentForm({ component, componentType, onSave, onDiscard, mode }: ComponentFormProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(component, componentType))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const record: Omit<ComponentRecord, 'id'> = {
        name: form.name,
        componentType,
        dietary_tags: form.dietary_tags,
        protein_tag: form.protein_tag,
        regional_tags: form.regional_tags,
        occasion_tags: form.occasion_tags,
        created_at: component?.created_at ?? new Date().toISOString(),
        ...(componentType === 'base' ? { base_type: form.base_type } : {}),
        ...(componentType === 'extra'
          ? { extra_category: form.extra_category, compatible_base_types: form.compatible_base_types }
          : {}),
      }

      if (mode === 'edit' && component?.id !== undefined) {
        await updateComponent(component.id, record)
      } else {
        await addComponent(record)
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const singularLabel = SINGULAR_LABEL[componentType]

  return (
    <div className="space-y-4 py-2">
      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="comp-name" className="text-xs font-semibold">Name</Label>
        <Input
          id="comp-name"
          value={form.name}
          onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
          placeholder={`${singularLabel} name`}
          required
        />
      </div>

      {/* Base type (Base only) */}
      {componentType === 'base' && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Base Type</Label>
          <Select
            value={form.base_type}
            onValueChange={val => setForm(s => ({ ...s, base_type: val as BaseType }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rice-based">Rice-based</SelectItem>
              <SelectItem value="bread-based">Bread-based</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Extra category (Extra only) */}
      {componentType === 'extra' && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Extra Category</Label>
          <Select
            value={form.extra_category}
            onValueChange={val => setForm(s => ({ ...s, extra_category: val as ExtraCategory }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTRA_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Compatible base types (Extra only) */}
      {componentType === 'extra' && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Compatible Base Types</Label>
          <div className="flex flex-wrap gap-3">
            {BASE_TYPES.map(bt => (
              <label key={bt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={form.compatible_base_types.includes(bt)}
                  onCheckedChange={() =>
                    setForm(s => ({ ...s, compatible_base_types: toggleArrayValue(s.compatible_base_types, bt) }))
                  }
                />
                {bt}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Dietary tags */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold">Dietary Tags</Label>
        <div className="flex flex-wrap gap-3">
          {DIETARY_TAGS.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={form.dietary_tags.includes(tag)}
                onCheckedChange={() =>
                  setForm(s => ({ ...s, dietary_tags: toggleArrayValue(s.dietary_tags, tag) }))
                }
              />
              {tag}
            </label>
          ))}
        </div>
      </div>

      {/* Protein tag */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold">Protein Tag</Label>
        <Select
          value={form.protein_tag}
          onValueChange={val => setForm(s => ({ ...s, protein_tag: val as ProteinTag }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROTEIN_TAGS.map(pt => (
              <SelectItem key={pt} value={pt}>{pt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Regional tags */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold">Regional Tags</Label>
        <div className="flex flex-wrap gap-3">
          {REGIONAL_TAGS.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={form.regional_tags.includes(tag)}
                onCheckedChange={() =>
                  setForm(s => ({ ...s, regional_tags: toggleArrayValue(s.regional_tags, tag) }))
                }
              />
              {tag}
            </label>
          ))}
        </div>
      </div>

      {/* Occasion tags */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold">Occasion Tags</Label>
        <div className="flex flex-wrap gap-3">
          {OCCASION_TAGS.map(tag => (
            <label key={tag} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={form.occasion_tags.includes(tag)}
                onCheckedChange={() =>
                  setForm(s => ({ ...s, occasion_tags: toggleArrayValue(s.occasion_tags, tag) }))
                }
              />
              {tag}
            </label>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
          Save {singularLabel}
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard changes
        </Button>
      </div>
    </div>
  )
}

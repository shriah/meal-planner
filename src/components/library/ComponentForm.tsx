'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addComponent, updateComponent } from '@/services/food-db'
import { getCategoriesByKind } from '@/services/category-db'
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
import { Separator } from '@/components/ui/separator'
import {
  BUILT_IN_BASE_CATEGORY_NAMES,
  BUILT_IN_EXTRA_CATEGORY_NAMES,
  type CategoryRecord,
} from '@/types/category'
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
const GENERAL_OCCASION_TAGS: OccasionTag[] = ['everyday', 'weekday', 'weekend', 'fasting', 'festive']
const DAY_TAGS: OccasionTag[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
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
  base_category_id: string
  extra_category_id: string
  compatible_base_category_ids: number[]
  dietary_tags: DietaryTag[]
  protein_tag: ProteinTag
  regional_tags: RegionalTag[]
  occasion_tags: OccasionTag[]
}

function initialFormState(component: ComponentRecord | undefined, componentType: ComponentType): FormState {
  if (component) {
    return {
      name: component.name,
      base_category_id: componentType === 'base' ? String(component.base_category_id ?? '') : '',
      extra_category_id: componentType === 'extra' ? String(component.extra_category_id ?? '') : '',
      compatible_base_category_ids: component.compatible_base_category_ids ?? [],
      dietary_tags: component.dietary_tags,
      protein_tag: component.protein_tag ?? 'none',
      regional_tags: component.regional_tags,
      occasion_tags: component.occasion_tags,
    }
  }
  return {
    name: '',
    base_category_id: '',
    extra_category_id: '',
    compatible_base_category_ids: [],
    dietary_tags: [],
    protein_tag: 'none',
    regional_tags: [],
    occasion_tags: [],
  }
}

function toggleArrayValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}

function getBuiltInBaseType(name: string | undefined): BaseType | undefined {
  if (!name) {
    return undefined
  }

  return BUILT_IN_BASE_CATEGORY_NAMES.find((value) => value === name)
}

function getBuiltInExtraCategory(name: string | undefined): ExtraCategory | undefined {
  if (!name) {
    return undefined
  }

  return BUILT_IN_EXTRA_CATEGORY_NAMES.find((value) => value === name)
}

function findCategory(categories: CategoryRecord[] | undefined, id: string) {
  if (!id) {
    return undefined
  }

  return categories?.find((category) => String(category.id) === id)
}

function showsCompatibleBaseChecklist(componentType: ComponentType) {
  return componentType === 'extra' || componentType === 'curry'
}

export function ComponentForm({ component, componentType, onSave, onDiscard, mode }: ComponentFormProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(component, componentType))
  const [saving, setSaving] = useState(false)
  const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], undefined)
  const extraCategories = useLiveQuery(() => getCategoriesByKind('extra'), [], undefined)
  const sourceFormState = useMemo(
    () => initialFormState(component, componentType),
    [
      componentType,
      component?.id,
      component?.name,
      component?.base_category_id,
      component?.extra_category_id,
      component?.created_at,
      component?.protein_tag,
      component?.dietary_tags.join('|'),
      component?.regional_tags.join('|'),
      component?.occasion_tags.join('|'),
      component?.compatible_base_category_ids?.join('|'),
    ],
  )

  useEffect(() => {
    if (!component) {
      return
    }

    setForm(sourceFormState)
  }, [component, sourceFormState])

  useEffect(() => {
    if (componentType !== 'base' || !baseCategories?.length || form.base_category_id) {
      return
    }

    setForm((current) => ({ ...current, base_category_id: String(baseCategories[0].id ?? '') }))
  }, [baseCategories, componentType, form.base_category_id])

  useEffect(() => {
    if (componentType !== 'extra' || !extraCategories?.length || form.extra_category_id) {
      return
    }

    setForm((current) => ({ ...current, extra_category_id: String(extraCategories[0].id ?? '') }))
  }, [componentType, extraCategories, form.extra_category_id])

  const selectedBaseCategory = findCategory(baseCategories, form.base_category_id)
  const selectedExtraCategory = findCategory(extraCategories, form.extra_category_id)
  const legacyCompatibleBaseTypes = useMemo(
    () => form.compatible_base_category_ids
      .map((id) => baseCategories?.find((category) => category.id === id)?.name)
      .map((name) => getBuiltInBaseType(name))
      .filter((value): value is BaseType => value !== undefined),
    [baseCategories, form.compatible_base_category_ids],
  )
  const canSaveBase = componentType !== 'base' || Boolean(form.base_category_id)
  const canSaveExtra = componentType !== 'extra' || Boolean(form.extra_category_id)
  const hasZeroCompatibleBases =
    componentType === 'curry' && form.compatible_base_category_ids.length === 0

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
        ...(componentType === 'base'
          ? {
              base_category_id: form.base_category_id ? Number(form.base_category_id) : null,
              base_type: getBuiltInBaseType(selectedBaseCategory?.name),
            }
          : {}),
        ...(componentType === 'extra'
          ? {
              extra_category_id: form.extra_category_id ? Number(form.extra_category_id) : null,
              compatible_base_category_ids: form.compatible_base_category_ids,
              extra_category: getBuiltInExtraCategory(selectedExtraCategory?.name),
              compatible_base_types: legacyCompatibleBaseTypes,
            }
          : {}),
        ...(componentType === 'curry'
          ? {
              compatible_base_category_ids: form.compatible_base_category_ids,
            }
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
          <Label className="text-xs font-semibold">Base Category</Label>
          <Select
            value={form.base_category_id}
            onValueChange={value => setForm(s => ({ ...s, base_category_id: value }))}
          >
            <SelectTrigger className="w-full" aria-label="Base Category">
              <SelectValue placeholder={baseCategories ? 'Select a base category' : 'Loading base categories...'} />
            </SelectTrigger>
            <SelectContent>
              {(baseCategories ?? []).map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Extra category (Extra only) */}
      {componentType === 'extra' && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Extra Category</Label>
          <Select
            value={form.extra_category_id}
            onValueChange={value => setForm(s => ({ ...s, extra_category_id: value }))}
          >
            <SelectTrigger className="w-full" aria-label="Extra Category">
              <SelectValue placeholder={extraCategories ? 'Select an extra category' : 'Loading extra categories...'} />
            </SelectTrigger>
            <SelectContent>
              {(extraCategories ?? []).map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Compatible base types (Extra only) */}
      {showsCompatibleBaseChecklist(componentType) && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Compatible Base Categories</legend>
          <div className="flex flex-wrap gap-3">
            {(baseCategories ?? []).map((category) => (
              <label key={category.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={form.compatible_base_category_ids.includes(category.id ?? -1)}
                  onCheckedChange={() =>
                    setForm(s => ({
                      ...s,
                      compatible_base_category_ids: toggleArrayValue(
                        s.compatible_base_category_ids,
                        category.id!,
                      ),
                    }))
                  }
                />
                {category.name}
              </label>
            ))}
          </div>
          {baseCategories === undefined && (
            <p className="text-xs text-muted-foreground">Loading compatible base categories...</p>
          )}
          {hasZeroCompatibleBases && (
            <p className="text-xs text-amber-700">
              No compatible base categories selected. This curry will not be auto-selected.
            </p>
          )}
        </fieldset>
      )}

      {(componentType === 'base' || showsCompatibleBaseChecklist(componentType)) && (
        <Separator />
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
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Occasion Tags</Label>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">General</span>
          <div className="flex flex-wrap gap-3">
            {GENERAL_OCCASION_TAGS.map(tag => (
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
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Specific days</span>
          <div className="flex flex-wrap gap-3">
            {DAY_TAGS.map(tag => (
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
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !form.name.trim() || !canSaveBase || !canSaveExtra}>
          Save {singularLabel}
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard changes
        </Button>
      </div>
    </div>
  )
}

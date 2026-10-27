'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getOwnedRules, saveComponent } from '@/services/food-db'
import { dayModeOf, daysOfMode, ownedChanges, readOwned, type DayMode, type RuleRecord } from '@/rules'
import { DAYS, type Day } from '@/planner'
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
import {
  CURRY_CATEGORIES,
  DIETARY_TAGS,
  OCCASION_TAGS,
  PROTEIN_TAGS,
  REGIONAL_TAGS,
  type ComponentRecord,
  type ComponentType,
  type CurryCategory,
  type Frequency,
  type BaseType,
  type ExtraCategory,
  type DietaryTag,
  type ProteinTag,
  type RegionalTag,
  type OccasionTag,
} from '@/types/component'

/** Which days a dish may be planned on; anything but 'any' is stored as an `allowed_days` rule. */
const DAY_MODES: { value: DayMode; label: string }[] = [
  { value: 'any', label: 'Any day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'specific', label: 'Specific days' },
]

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'frequent', label: 'Often' },
  { value: 'normal', label: 'Normal' },
  { value: 'rare', label: 'Rarely' },
]

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
  /** Starting values for a new dish (e.g. from the assistant); ignored when editing. */
  draft?: Partial<ComponentRecord>
}

interface FormState {
  name: string
  base_category_id: string
  extra_category_id: string
  compatible_base_category_ids: number[]
  /** 'none' when the curry has no type. */
  curry_category: CurryCategory | 'none'
  /** Curry types an extra never goes with. */
  clash_curry_categories: CurryCategory[]
  dietary_tags: DietaryTag[]
  protein_tag: ProteinTag
  regional_tags: RegionalTag[]
  occasion_tags: OccasionTag[]
  frequency: Frequency
  day_mode: DayMode
  /** Specific days the dish may be planned on, when day_mode is 'specific'. */
  days: Day[]
  /** Never planned automatically; can still be picked by hand. */
  never_auto: boolean
}

function initialFormState(
  component: ComponentRecord | undefined,
  componentType: ComponentType,
  ownedRules: RuleRecord[] = [],
  draft?: Partial<ComponentRecord>,
): FormState {
  const owned = readOwned(ownedRules)
  if (component) {
    return {
      name: component.name,
      base_category_id: componentType === 'base' ? String(component.base_category_id ?? '') : '',
      extra_category_id: componentType === 'extra' ? String(component.extra_category_id ?? '') : '',
      compatible_base_category_ids: owned.bases,
      curry_category: component.curry_category ?? 'none',
      clash_curry_categories: owned.clashes,
      dietary_tags: component.dietary_tags,
      protein_tag: component.protein_tag ?? 'none',
      regional_tags: component.regional_tags,
      occasion_tags: component.occasion_tags,
      frequency: component.frequency ?? 'normal',
      day_mode: dayModeOf(owned.days),
      days: owned.days,
      never_auto: owned.neverAuto,
    }
  }
  return {
    name: draft?.name ?? '',
    base_category_id: componentType === 'base' ? String(draft?.base_category_id ?? '') : '',
    extra_category_id: componentType === 'extra' ? String(draft?.extra_category_id ?? '') : '',
    compatible_base_category_ids: [],
    curry_category: componentType === 'curry' ? (draft?.curry_category ?? 'none') : 'none',
    clash_curry_categories: [],
    dietary_tags: draft?.dietary_tags ?? [],
    protein_tag: draft?.protein_tag ?? 'none',
    regional_tags: draft?.regional_tags ?? [],
    occasion_tags: draft?.occasion_tags ?? [],
    frequency: 'normal',
    day_mode: 'any',
    days: [],
    never_auto: false,
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
  return componentType === 'curry' || componentType === 'subzi'
}

export function ComponentForm({ component, componentType, onSave, onDiscard, mode, draft }: ComponentFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialFormState(component, componentType, [], mode === 'add' ? draft : undefined),
  )
  const [saving, setSaving] = useState(false)
  const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], undefined)
  const extraCategories = useLiveQuery(() => getCategoriesByKind('extra'), [], undefined)
  // Compatible bases (curry, subzi), clashing curry types (extra) and specific days are stored as
  // rules the component owns.
  const owned = useLiveQuery(
    () => (component?.id !== undefined ? getOwnedRules(component.id) : []),
    [component?.id],
  )
  // Re-sync the form when the edited record changes underneath it (e.g. live query update).
  // Adjusting state during render avoids the extra render pass an effect would cause.
  const sourceFormState = initialFormState(component, componentType, owned)
  const sourceKey = JSON.stringify([component?.id, component?.created_at, sourceFormState])
  const [syncedKey, setSyncedKey] = useState(sourceKey)
  if (component && sourceKey !== syncedKey) {
    setSyncedKey(sourceKey)
    setForm(sourceFormState)
  }

  // Until the user picks one, default to the first category of the matching kind.
  const baseCategoryId =
    form.base_category_id || (componentType === 'base' ? String(baseCategories?.[0]?.id ?? '') : '')
  const extraCategoryId =
    form.extra_category_id || (componentType === 'extra' ? String(extraCategories?.[0]?.id ?? '') : '')

  const selectedBaseCategory = findCategory(baseCategories, baseCategoryId)
  const selectedExtraCategory = findCategory(extraCategories, extraCategoryId)
  const canSaveBase = componentType !== 'base' || Boolean(baseCategoryId)
  const canSaveExtra = componentType !== 'extra' || Boolean(extraCategoryId)

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
        frequency: form.frequency,
        created_at: component?.created_at ?? new Date().toISOString(),
        ...(componentType === 'base'
          ? {
              base_category_id: baseCategoryId ? Number(baseCategoryId) : null,
              base_type: getBuiltInBaseType(selectedBaseCategory?.name),
            }
          : {}),
        ...(componentType === 'extra'
          ? {
              extra_category_id: extraCategoryId ? Number(extraCategoryId) : null,
              extra_category: getBuiltInExtraCategory(selectedExtraCategory?.name),
            }
          : {}),
        ...(componentType === 'curry'
          ? { curry_category: form.curry_category === 'none' ? undefined : form.curry_category }
          : {}),
      }

      // With nothing chosen, a dish goes with any base, any curry and any day.
      const changes = ownedChanges(componentType, {
        bases: form.compatible_base_category_ids,
        clashes: form.clash_curry_categories,
        days: daysOfMode(form.day_mode, form.days),
        neverAuto: form.never_auto,
      })
      const id = mode === 'edit' ? component?.id : undefined
      await saveComponent(id, record, changes)
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
            value={baseCategoryId}
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
            value={extraCategoryId}
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

      {/* Curry type (Curry only) */}
      {componentType === 'curry' && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Curry Type</Label>
          <Select
            value={form.curry_category}
            onValueChange={value => setForm(s => ({ ...s, curry_category: value as FormState['curry_category'] }))}
          >
            <SelectTrigger className="w-full" aria-label="Curry Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">none</SelectItem>
              {CURRY_CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator />

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
        <p className="text-xs text-muted-foreground">
          Tags describe a dish; use them in rules, for example “festive dishes only on weekends”.
        </p>
        <div className="space-y-1">
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
      </div>

      {/* Planning: how often, and the pairing and day settings that are stored as rules */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Planning</h3>
          <p className="text-xs text-muted-foreground">
            Pairings, days and “never plan automatically” are saved as rules you can also see on the Rules page.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-semibold">How often</Label>
          <Select
            value={form.frequency}
            onValueChange={value => setForm(s => ({ ...s, frequency: value as Frequency }))}
          >
            <SelectTrigger className="w-full" aria-label="How often">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      {/* Curry types this extra never goes with (Extra only) */}
      {componentType === 'extra' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Never With These Curry Types</legend>
          <div className="flex flex-wrap gap-3">
            {CURRY_CATEGORIES.map(category => (
              <label key={category} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={form.clash_curry_categories.includes(category)}
                  onCheckedChange={() =>
                    setForm(s => ({ ...s, clash_curry_categories: toggleArrayValue(s.clash_curry_categories, category) }))
                  }
                />
                {category}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Compatible base categories (Curry and Subzi) */}
      {showsCompatibleBaseChecklist(componentType) && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Compatible Base Categories</legend>
          <div className="flex flex-wrap gap-3">
            {(baseCategories ?? []).map((category) => (
              <label key={category.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={form.compatible_base_category_ids.includes(category.id)}
                  onCheckedChange={() =>
                    setForm(s => ({
                      ...s,
                      compatible_base_category_ids: toggleArrayValue(
                        s.compatible_base_category_ids,
                        category.id,
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
          {form.compatible_base_category_ids.length === 0 && (
            <p className="text-xs text-muted-foreground">None selected: goes with any base.</p>
          )}
        </fieldset>
      )}

      {/* Days and automatic planning, stored as rules the dish owns */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Days</Label>
        <Select
          value={form.day_mode}
          onValueChange={value => setForm(s => ({ ...s, day_mode: value as DayMode }))}
        >
          <SelectTrigger className="w-full" aria-label="Days">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_MODES.map(mode => (
              <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.day_mode === 'specific' && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Specific days</span>
            <div className="flex flex-wrap gap-3">
              {DAYS.map(day => (
                <label key={day} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={form.days.includes(day)}
                    onCheckedChange={() =>
                      setForm(s => ({ ...s, days: toggleArrayValue(s.days, day) }))
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox
            checked={form.never_auto}
            onCheckedChange={checked => setForm(s => ({ ...s, never_auto: checked === true }))}
          />
          Never plan automatically
        </label>
      </div>
      </section>

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

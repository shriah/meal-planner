'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DAYS, MEALS, type Day, type Meal } from '@/planner'
import { describeLink, dishTypeOf, isDishTarget, LINK_LABEL, LINK_STRENGTHS, LINK_TARGETS, linkSlotOf, offersLink, type DishLink, type LinkScope, type LinkSlot, type LinkStrength, type LinkTarget, type LinkValue } from '@/rules'
import { CURRY_CATEGORIES, type ComponentType } from '@/types/component'
import { linkNames, useLibraryLookup, type LibraryLookup } from '../LibraryLookup'
import { OptionPicker, type Option } from './OptionPicker'

const STRENGTH_LABEL: Record<LinkStrength, string> = { always: 'Always', usually: 'Usually', moderately: 'Often', sometimes: 'Sometimes' }
const MODE_LABEL = { with: 'Only with', never: 'Never with' } as const
const MODES = ['with', 'never'] as const

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What a link to `target` can pick from; a dish is never offered itself. */
export function linkOptions(lookup: Pick<LibraryLookup, 'dishes' | 'baseCategories' | 'extraCategories'>, target: LinkTarget, selfId?: number): Option[] {
  if (isDishTarget(target)) {
    return lookup.dishes.filter((d) => d.componentType === dishTypeOf(target) && d.id !== selfId).map((d) => ({ value: d.id, label: d.name }))
  }
  if (target === 'curry_category') return CURRY_CATEGORIES.map((c) => ({ value: c, label: c }))
  const categories = target === 'base_category' ? lookup.baseCategories : lookup.extraCategories
  return categories.map((c) => ({ value: c.id, label: c.name }))
}

/** The stored form of a scope: empty lists dropped, and nothing when nothing is left. */
export function cleanScope(scope: LinkScope | undefined): LinkScope | undefined {
  const out: LinkScope = {}
  if (scope?.days?.length) out.days = DAYS.filter((d) => scope.days!.includes(d))
  if (scope?.meals?.length) out.meals = MEALS.filter((m) => scope.meals!.includes(m))
  return out.days || out.meals ? out : undefined
}

interface LinkEditorProps {
  componentType: ComponentType
  selfId?: number
  /** For the preview sentence; a new dish may have no name yet. */
  dishName?: string
  initial?: DishLink
  /** Slots other links already fill. */
  taken: LinkSlot[]
  onDone: (link: DishLink) => void
  onCancel: () => void
}

export function LinkEditor({ componentType, selfId, dishName, initial, taken, onDone, onCancel }: LinkEditorProps) {
  const lookup = useLibraryLookup()
  const own = initial && linkSlotOf(initial)
  const free = (mode: DishLink['mode'], target: LinkTarget) => {
    const slot = linkSlotOf({ mode, target })
    return slot === own || !taken.includes(slot)
  }
  const targets = LINK_TARGETS.filter((t) => offersLink(componentType, t) && MODES.some((m) => free(m, t)))
  const firstMode = (target: LinkTarget) => MODES.find((m) => free(m, target)) ?? 'with'

  const [target, setTarget] = useState<LinkTarget | undefined>(initial?.target ?? targets[0])
  const [mode, setMode] = useState<DishLink['mode']>(initial?.mode ?? (targets[0] ? firstMode(targets[0]) : 'with'))
  const [strength, setStrength] = useState<LinkStrength>(initial?.strength ?? 'always')
  const [values, setValues] = useState<LinkValue[]>(initial?.values ?? [])
  const [days, setDays] = useState<Day[]>(initial?.scope?.days ?? [])
  const [meals, setMeals] = useState<Meal[]>(initial?.scope?.meals ?? [])
  const [showScope, setShowScope] = useState(Boolean(cleanScope(initial?.scope)))

  if (!target) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Every kind of link is already used.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    )
  }

  const scope = cleanScope({ days, meals })
  const link: DishLink = { mode, target, values, strength, ...(scope ? { scope } : {}) }
  const pickTarget = (next: LinkTarget) => {
    setTarget(next)
    if (!free(mode, next)) setMode(firstMode(next))
    // Values of one target mean nothing for another.
    if (next !== target) setValues([])
  }
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label htmlFor="link-target" className="text-xs font-semibold">Link to</Label>
        <select
          id="link-target"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={target}
          onChange={(e) => pickTarget(e.target.value as LinkTarget)}
        >
          {targets.map((t) => <option key={t} value={t}>{capitalise(LINK_LABEL[t])}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Mode">
        {MODES.map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'outline'} aria-pressed={mode === m}
            disabled={!free(m, target)} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="How firmly">
        {LINK_STRENGTHS.map((s) => (
          <Button key={s} type="button" size="sm" variant={strength === s ? 'secondary' : 'outline'} aria-pressed={strength === s}
            onClick={() => setStrength(s)}>
            {STRENGTH_LABEL[s]}
          </Button>
        ))}
      </div>

      <OptionPicker key={target} options={linkOptions(lookup, target, selfId)} selected={values} onChange={setValues} />

      {showScope ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Only on</legend>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d) => (
              <Label key={d} className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
                <Checkbox checked={days.includes(d)} onCheckedChange={() => setDays(toggle(days, d))} />
                {capitalise(d)}
              </Label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {MEALS.map((m) => (
              <Label key={m} className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
                <Checkbox checked={meals.includes(m)} onCheckedChange={() => setMeals(toggle(meals, m))} />
                {capitalise(m)}
              </Label>
            ))}
          </div>
        </fieldset>
      ) : (
        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setShowScope(true)}>Limit to days or meals</Button>
      )}

      <p className="text-xs text-muted-foreground">
        {values.length > 0 ? describeLink(dishName?.trim() || 'This dish', link, linkNames(lookup)) : 'Tick at least one option to make a link.'}
      </p>

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={values.length === 0} onClick={() => onDone(link)}>Done</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

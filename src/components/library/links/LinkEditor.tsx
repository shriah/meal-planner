'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DAYS, MEALS, type Day, type Meal } from '@/planner'
import { addableSlots, cleanWhen, describeLink, dishTypeOf, isDishTarget, isSideTarget, LINK_LABEL, LINK_STRENGTHS, LINK_TARGETS, linkSlotOf, offersComes, STRENGTH_WORDS, type DishLink, type LinkMode, type LinkScope, type LinkSlot, type LinkStrength, type LinkTarget, type LinkValue } from '@/rules'
import { CURRY_CATEGORIES, type ComponentType } from '@/types/component'
import { linkNames, useLibraryLookup, type LibraryLookup } from '../LibraryLookup'
import { OptionPicker, type Option } from './OptionPicker'

export const MODE_LABEL: Record<LinkMode, string> = { serve: 'Served with', with: 'Only with', never: 'Never with', comes: 'Comes with' }

/** A side is brought along ("comes with") rather than limited to; bases keep "only with". */
const SIDE_MODES: LinkMode[] = ['comes', 'never']
const BASE_MODES: LinkMode[] = ['serve', 'with', 'never']

/** The mode a link opens with: an old "only with" link to sides opens as "comes with", so saving it brings the dish. */
const shownMode = (link: Pick<DishLink, 'mode' | 'target'>): LinkMode =>
  link.mode === 'with' && isSideTarget(link.target) ? 'comes' : link.mode

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

/** Targets a base's "comes with" link may wait on a curry and subzi for; a link that brings a subzi waits on a curry only. */
const WAITING_TARGETS: readonly LinkTarget[] = ['extra_dish', 'extra_category', 'subzi_dish']

/** Whether a link may wait for the meal's curry (or subzi) before it brings its side. */
export function waitsFor(componentType: ComponentType, mode: LinkMode, target: LinkTarget, part: 'curry' | 'subzi'): boolean {
  if (componentType !== 'base' || mode !== 'comes' || !WAITING_TARGETS.includes(target)) return false
  return part === 'curry' || target !== 'subzi_dish'
}

interface LinkEditorProps {
  componentType: ComponentType
  selfId?: number
  /** For the preview sentence; a new dish may have no name yet. */
  dishName?: string
  initial?: DishLink
  /** The dish's links, which decide what a new one may be. */
  links: DishLink[]
  onDone: (link: DishLink) => void
  onCancel: () => void
}

export function LinkEditor({ componentType, selfId, dishName, initial, links, onDone, onCancel }: LinkEditorProps) {
  const lookup = useLibraryLookup()
  // What Add offers, plus the link being edited, so a stored link stays editable even where Add would not offer it.
  const offered: LinkSlot[] = [...addableSlots(componentType, links), ...(initial ? [linkSlotOf({ mode: shownMode(initial), target: initial.target })] : [])]
  // A dish may come with several sides, so "comes with" is offered wherever it suits, however often it is used.
  const free = (mode: LinkMode, target: LinkTarget) =>
    (mode === 'comes' && offersComes(componentType, target)) || offered.includes(linkSlotOf({ mode, target }))
  const modesFor = (t: LinkTarget): LinkMode[] => (isSideTarget(t) ? SIDE_MODES : BASE_MODES).filter((m) => free(m, t))
  const targets = LINK_TARGETS.filter((t) => modesFor(t).length > 0)
  const firstMode = (target: LinkTarget) => modesFor(target)[0] ?? 'with'

  const [target, setTarget] = useState<LinkTarget | undefined>(initial?.target ?? targets[0])
  const [mode, setMode] = useState<DishLink['mode']>(initial ? shownMode(initial) : (targets[0] ? firstMode(targets[0]) : 'with'))
  const [strength, setStrength] = useState<LinkStrength>(initial?.strength ?? 'always')
  const [values, setValues] = useState<LinkValue[]>(initial?.values ?? [])
  const [days, setDays] = useState<Day[]>(initial?.scope?.days ?? [])
  const [meals, setMeals] = useState<Meal[]>(initial?.scope?.meals ?? [])
  const [showScope, setShowScope] = useState(Boolean(cleanScope(initial?.scope)))
  const [whenCurry, setWhenCurry] = useState<number[]>(initial?.when?.curry ?? [])
  const [whenSubzi, setWhenSubzi] = useState<number[]>(initial?.when?.subzi ?? [])

  if (!target) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Every kind of link is already used.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    )
  }

  const scope = cleanScope({ days, meals })
  const asksCurry = waitsFor(componentType, mode, target, 'curry')
  const asksSubzi = waitsFor(componentType, mode, target, 'subzi')
  const when = cleanWhen({ curry: asksCurry ? whenCurry : [], subzi: asksSubzi ? whenSubzi : [] })
  const link: DishLink = { mode, target, values, strength, ...(scope ? { scope } : {}), ...(when ? { when } : {}) }
  const pickTarget = (next: LinkTarget) => {
    setTarget(next)
    const nextMode = modesFor(next).includes(mode) ? mode : firstMode(next)
    if (nextMode !== mode) setMode(nextMode)
    // Values of one target mean nothing for another.
    if (next !== target) setValues([])
    // A target that does not wait for a curry or subzi drops what was picked for it.
    if (!waitsFor(componentType, nextMode, next, 'curry')) setWhenCurry([])
    if (!waitsFor(componentType, nextMode, next, 'subzi')) setWhenSubzi([])
  }
  const pickMode = (next: LinkMode) => {
    setMode(next)
    if (!waitsFor(componentType, next, target, 'curry')) setWhenCurry([])
    if (!waitsFor(componentType, next, target, 'subzi')) setWhenSubzi([])
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
        {modesFor(target).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'outline'} aria-pressed={mode === m}
            onClick={() => pickMode(m)}>
            {MODE_LABEL[m]}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <span className="text-xs font-semibold">How firmly</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="How firmly">
          {LINK_STRENGTHS.map((s) => (
            <Button key={s} type="button" size="sm" variant={strength === s ? 'secondary' : 'outline'} aria-pressed={strength === s}
              onClick={() => setStrength(s)}>
              {STRENGTH_WORDS[s].label}
            </Button>
          ))}
        </div>
      </div>

      <OptionPicker key={target} options={linkOptions(lookup, target, selfId)} selected={values} onChange={setValues} />

      {asksCurry && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">When the curry is</legend>
          <p className="text-xs text-muted-foreground">Leave empty for any curry.</p>
          <OptionPicker options={linkOptions(lookup, 'curry_dish', selfId)} selected={whenCurry} onChange={(v) => setWhenCurry(v as number[])} />
        </fieldset>
      )}
      {asksSubzi && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">When the subzi is</legend>
          <p className="text-xs text-muted-foreground">Leave empty for any subzi.</p>
          <OptionPicker options={linkOptions(lookup, 'subzi_dish', selfId)} selected={whenSubzi} onChange={(v) => setWhenSubzi(v as number[])} />
        </fieldset>
      )}

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

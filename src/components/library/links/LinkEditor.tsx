'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DAYS, MEALS, type Day, type Meal } from '@/planner'
import {
  addableSlots, bringMode, cleanWhen, describeLink, linkModes, linkSlotOf, linkTargets, LINK_STRENGTHS, pluralNoun, sameTarget,
  singularNoun, STRENGTH_WORDS, type DishLink, type LinkMode, type LinkScope, type LinkSlot, type LinkStrength, type LinkTarget,
  type LinkValue, type LinkWhen,
} from '@/rules'
import { cappedOf, dishPart, linkNames, useLibraryLookup, type LibraryLookup } from '../LibraryLookup'
import { OptionPicker, type Option } from './OptionPicker'

type Lookup = Pick<LibraryLookup, 'dishes' | 'categories' | 'parts'>

/** A mode's button: a link that brings or is brought reads "Served with" to the first part and "Comes with" to any other. */
export function modeLabel(mode: LinkMode, target: LinkTarget, firstPart: number | undefined): string {
  if (mode === 'with') return 'Only with'
  if (mode === 'never') return 'Never with'
  return mode === 'serve' && target.part === firstPart ? 'Served with' : 'Comes with'
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A target as the "Link to" select names it: "base categories", "curry types", "specific subzis". */
export function targetLabel(lookup: Lookup, target: LinkTarget): string {
  const part = lookup.parts.find((p) => p.id === target.part)
  const name = part?.name ?? `part #${target.part}`
  if (target.kind === 'dish') return `specific ${pluralNoun(name)}`
  const categories = lookup.categories.filter((c) => c.part_id === target.part)
  // The Curry part's categories are curry types, as `Names.categoryIsType` reads them.
  const types = categories.length > 0 && categories.every((c) => c.kind === 'curry')
  return `${singularNoun(name)} ${types ? 'types' : 'categories'}`
}

const targetKey = (t: LinkTarget) => `${t.part}:${t.kind}`

/** What a link to `target` can pick from: the part's dishes or its categories; a dish is never offered itself. */
export function linkOptions(lookup: Lookup, target: LinkTarget, selfId?: number): Option[] {
  if (target.kind === 'dish') {
    return lookup.dishes.filter((d) => dishPart(lookup, d) === target.part && d.id !== selfId).map((d) => ({ value: d.id, label: d.name }))
  }
  return lookup.categories.filter((c) => c.part_id === target.part).map((c) => ({ value: c.id, label: c.name }))
}

/** The stored form of a scope: empty lists dropped, and nothing when nothing is left. */
export function cleanScope(scope: LinkScope | undefined): LinkScope | undefined {
  const out: LinkScope = {}
  if (scope?.days?.length) out.days = DAYS.filter((d) => scope.days!.includes(d))
  if (scope?.meals?.length) out.meals = MEALS.filter((m) => scope.meals!.includes(m))
  return out.days || out.meals ? out : undefined
}

/** The parts a comes link may wait for: every part but the first, the one it brings into and the dish's own. */
export function waitParts(lookup: Pick<LibraryLookup, 'parts'>, mode: LinkMode, target: LinkTarget, ownerPart: number): number[] {
  if (mode !== 'comes') return []
  return lookup.parts.slice(1).map((p) => p.id).filter((id) => id !== target.part && id !== ownerPart)
}

interface LinkEditorProps {
  /** The part the dish is in; its links are made from there. */
  ownerPart: number
  selfId?: number
  /** For the preview sentence; a new dish may have no name yet. */
  dishName?: string
  initial?: DishLink
  /** The dish's links, which decide what a new one may be. */
  links: DishLink[]
  onDone: (link: DishLink) => void
  onCancel: () => void
}

export function LinkEditor({ ownerPart, selfId, dishName, initial, links, onDone, onCancel }: LinkEditorProps) {
  const lookup = useLibraryLookup()
  const parts = lookup.parts
  const firstPart = parts[0]?.id
  const capped = cappedOf(lookup)
  // An old "only with" link to a part below the first only limited the dish; it opens as the link that brings it.
  const shownMode = (link: Pick<DishLink, 'mode' | 'target'>): LinkMode =>
    link.mode === 'with' && link.target.part !== firstPart ? bringMode(ownerPart, link.target.part, parts) : link.mode
  const allTargets = linkTargets(parts, (part) => lookup.categories.some((c) => c.part_id === part))
  // What Add offers, plus the link being edited, so a stored link stays editable even where Add would not offer it.
  const offered: LinkSlot[] = [
    ...addableSlots(ownerPart, links, allTargets, parts, capped),
    ...(initial ? [linkSlotOf({ mode: shownMode(initial), target: initial.target })] : []),
  ]
  const modesFor = (t: LinkTarget): LinkMode[] => {
    const modes = linkModes(ownerPart, t, parts, capped).filter((m) => offered.includes(linkSlotOf({ mode: m, target: t })))
    // A stored link stays editable in its own mode even where the editor would not offer that mode now.
    if (initial && sameTarget(initial.target, t) && !modes.includes(shownMode(initial))) modes.push(shownMode(initial))
    return modes
  }
  const targets = [
    ...allTargets.filter((t) => modesFor(t).length > 0),
    ...(initial && !allTargets.some((t) => sameTarget(t, initial.target)) ? [initial.target] : []),
  ]
  const firstMode = (target: LinkTarget) => modesFor(target)[0] ?? 'never'
  // A new link starts at the first target it can do more than keep away from (a dish's own part offers only that).
  const startTarget = targets.find((t) => modesFor(t).some((m) => m !== 'never')) ?? targets[0]

  const [target, setTarget] = useState<LinkTarget | undefined>(initial?.target ?? startTarget)
  const [mode, setMode] = useState<DishLink['mode']>(initial ? shownMode(initial) : (startTarget ? firstMode(startTarget) : 'never'))
  // Until a mode is picked (or a stored link opened), changing the target starts from that target's first mode.
  const [modeChosen, setModeChosen] = useState(Boolean(initial))
  const [strength, setStrength] = useState<LinkStrength>(initial?.strength ?? 'always')
  const [values, setValues] = useState<LinkValue[]>(initial?.values ?? [])
  const [days, setDays] = useState<Day[]>(initial?.scope?.days ?? [])
  const [meals, setMeals] = useState<Meal[]>(initial?.scope?.meals ?? [])
  const [showScope, setShowScope] = useState(Boolean(cleanScope(initial?.scope)))
  const [when, setWhen] = useState<LinkWhen>(initial?.when ?? {})

  if (!target) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Every kind of link is already used.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    )
  }

  const scope = cleanScope({ days, meals })
  const waits = waitParts(lookup, mode, target, ownerPart)
  const kept = cleanWhen(Object.fromEntries(waits.map((part) => [part, when[part] ?? []])))
  const link: DishLink = { mode, target, values, strength, ...(scope ? { scope } : {}), ...(kept ? { when: kept } : {}) }
  // A part the link no longer waits for drops what was picked for it, so coming back to it starts empty.
  const keepWaits = (nextMode: LinkMode, nextTarget: LinkTarget) => {
    const still = waitParts(lookup, nextMode, nextTarget, ownerPart)
    setWhen((w) => Object.fromEntries(Object.entries(w).filter(([part]) => still.includes(Number(part)))))
  }
  const pickTarget = (next: LinkTarget) => {
    setTarget(next)
    const nextMode = modeChosen && modesFor(next).includes(mode) ? mode : firstMode(next)
    if (nextMode !== mode) setMode(nextMode)
    // Values of one target mean nothing for another.
    if (!sameTarget(next, target)) setValues([])
    keepWaits(nextMode, next)
  }
  const pickMode = (next: LinkMode) => {
    setMode(next)
    setModeChosen(true)
    keepWaits(next, target)
  }
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  const partName = (id: number) => singularNoun(parts.find((p) => p.id === id)?.name ?? `part #${id}`)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label htmlFor="link-target" className="text-xs font-semibold">Link to</Label>
        <select
          id="link-target"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={targetKey(target)}
          onChange={(e) => pickTarget(targets.find((t) => targetKey(t) === e.target.value)!)}
        >
          {targets.map((t) => <option key={targetKey(t)} value={targetKey(t)}>{capitalise(targetLabel(lookup, t))}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Mode">
        {modesFor(target).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'outline'} aria-pressed={mode === m}
            onClick={() => pickMode(m)}>
            {modeLabel(m, target, firstPart)}
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

      <OptionPicker key={targetKey(target)} options={linkOptions(lookup, target, selfId)} selected={values} onChange={setValues} />

      {waits.map((part) => (
        <fieldset key={part} className="space-y-1">
          <legend className="text-xs font-semibold">When the {partName(part)} is</legend>
          <p className="text-xs text-muted-foreground">Leave empty for any {partName(part)}.</p>
          <OptionPicker options={linkOptions(lookup, { part, kind: 'dish' }, selfId)} selected={when[part] ?? []}
            onChange={(v) => setWhen((w) => ({ ...w, [part]: v as number[] }))} />
        </fieldset>
      ))}

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

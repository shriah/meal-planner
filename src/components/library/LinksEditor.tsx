'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CURRY_CATEGORIES, type ComponentType } from '@/types/component'
import type { CategoryRecord } from '@/types/category'
import type { ComponentRecord } from '@/types/component'
import { LINK_STRENGTHS, type LinkStrength, dishTypeOf, isDishTarget, LINK_LABEL, LINK_TARGETS, offersLink, type DishLink, type LinkTarget, type LinkValue } from '@/rules'

interface LinksEditorProps {
  componentType: ComponentType
  links: DishLink[]
  baseCategories: CategoryRecord[] | undefined
  extraCategories: CategoryRecord[] | undefined
  /** Every dish in the library, for linking to specific dishes. */
  dishes: ComponentRecord[] | undefined
  /** The dish being edited, left out of its own choices. */
  selfId?: number
  /** Replaces every link to `target` with `link`; undefined leaves the target with none. */
  onChange: (target: LinkTarget, link: DishLink | undefined) => void
}

/** `any` is no link to the target. */
type LinkMode = 'any' | DishLink['mode']

const STRENGTH_LABEL: Record<LinkStrength, string> = { always: 'Always', usually: 'Usually', moderately: 'Moderately', sometimes: 'Sometimes' }
const MODE_LABEL: Record<LinkMode, string> = { any: 'Any', with: 'Only with', never: 'Never with' }

/** "Goes with" / "Never with" for one kind of category at a time; the options follow the library's categories. */
export function LinksEditor({ componentType, links, baseCategories, extraCategories, dishes, selfId, onChange }: LinksEditorProps) {
  const options = (target: LinkTarget): { value: LinkValue; label: string }[] | undefined => {
    if (isDishTarget(target)) {
      return dishes?.filter((d) => d.componentType === dishTypeOf(target) && d.id !== selfId).map((d) => ({ value: d.id, label: d.name }))
    }
    if (target === 'curry_category') return CURRY_CATEGORIES.map((c) => ({ value: c, label: c }))
    const categories = target === 'base_category' ? baseCategories : extraCategories
    return categories?.map((c) => ({ value: c.id, label: c.name }))
  }

  return (
    <div className="space-y-3">
      {LINK_TARGETS.filter((t) => offersLink(componentType, t)).map((target) => {
        const all = options(target)
        // One dropdown per target for now: a goes-with link shows ahead of a never-with one.
        const current = links.find((l) => l.target === target && l.mode === 'with') ?? links.find((l) => l.target === target)
        const link = current ?? { mode: 'any' as const, target, values: [], strength: 'always' as const }
        const label = LINK_LABEL[target]
        const setMode = (mode: LinkMode) =>
          // Limiting a dish starts from every category, so unticking is what narrows it; "never" starts from none.
          onChange(target, mode === 'any' ? undefined : { ...link, mode, values: mode === 'with' ? (all ?? []).map((o) => o.value) : [] })
        return (
          <fieldset key={target} className="space-y-2">
            <legend className="text-xs font-semibold capitalize">{`Goes with ${label}`}</legend>
            <select
              aria-label={`Goes with ${label}`}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={link.mode}
              onChange={(e) => setMode(e.target.value as LinkMode)}
            >
              {(Object.keys(MODE_LABEL) as LinkMode[]).map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
            {link.mode !== 'any' && (
              <select
                aria-label={`How firmly, ${label}`}
                className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={link.strength}
                onChange={(e) => current && onChange(target, { ...current, strength: e.target.value as LinkStrength })}
              >
                {LINK_STRENGTHS.map((st) => (
                  <option key={st} value={st}>{STRENGTH_LABEL[st]}</option>
                ))}
              </select>
            )}
            {link.mode !== 'any' && (
              <div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto">
                {(all ?? []).map((o) => (
                  <Label key={String(o.value)} className="flex items-center gap-1.5 text-xs font-normal cursor-pointer">
                    <Checkbox
                      checked={link.values.includes(o.value)}
                      onCheckedChange={() =>
                        current && onChange(target, {
                          ...current,
                          values: current.values.includes(o.value) ? current.values.filter((v) => v !== o.value) : [...current.values, o.value],
                        })
                      }
                    />
                    {o.label}
                  </Label>
                ))}
              </div>
            )}
            {all === undefined && <p className="text-xs text-muted-foreground">Loading...</p>}
          </fieldset>
        )
      })}
    </div>
  )
}

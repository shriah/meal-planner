'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CURRY_CATEGORIES, type ComponentType } from '@/types/component'
import type { CategoryRecord } from '@/types/category'
import type { ComponentRecord } from '@/types/component'
import { LINK_STRENGTHS, type LinkStrength, dishTypeOf, isDishTarget, LINK_LABEL, LINK_TARGETS, offersLink, type Link, type LinkMode, type LinkTarget, type LinkValue, type Links } from '@/rules'

interface LinksEditorProps {
  componentType: ComponentType
  links: Links
  baseCategories: CategoryRecord[] | undefined
  extraCategories: CategoryRecord[] | undefined
  /** Every dish in the library, for linking to specific dishes. */
  dishes: ComponentRecord[] | undefined
  /** The dish being edited, left out of its own choices. */
  selfId?: number
  onChange: (target: LinkTarget, link: Link) => void
}

const STRENGTH_LABEL: Record<LinkStrength, string> = { always: 'Always', usually: 'Usually', sometimes: 'Sometimes' }
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
        const link = links[target]
        const label = LINK_LABEL[target]
        const setMode = (mode: LinkMode) =>
          // Limiting a dish starts from every category, so unticking is what narrows it; "never" starts from none.
          onChange(target, { mode, values: mode === 'with' ? (all ?? []).map((o) => o.value) : [], strength: link.strength })
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
                onChange={(e) => onChange(target, { ...link, strength: e.target.value as LinkStrength })}
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
                        onChange(target, {
                          mode: link.mode,
                          strength: link.strength,
                          values: link.values.includes(o.value) ? link.values.filter((v) => v !== o.value) : [...link.values, o.value],
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

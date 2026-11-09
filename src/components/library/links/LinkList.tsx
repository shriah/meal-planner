'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { addableSlots, describeLink, isSideTarget, LINK_TARGETS, linkWarnings, offersComes, type DishLink, type LinkWarning } from '@/rules'
import type { ComponentType } from '@/types/component'
import { linkNames, ShareLibraryLookup, useLibraryLookup } from '../LibraryLookup'
import { LinkEditor } from './LinkEditor'

interface LinkListProps {
  dishName: string
  componentType: ComponentType
  selfId?: number
  links: DishLink[]
  /** Rule ids of links that are stored switched off; they are shown marked "(off)". */
  offRuleIds?: readonly number[]
  onChange: (links: DishLink[]) => void
  /** Tells the form whether a link is being built, so it can hold back Save. */
  onEditingChange?: (open: boolean) => void
}

/** The problems with a dish's links; empty until the library has loaded, as nothing is known about it before. */
export function useLinkWarnings(self: { id?: number; name: string; componentType: ComponentType }, links: DishLink[]): LinkWarning[] {
  const lookup = useLibraryLookup()
  return lookup.loaded ? linkWarnings(self, links, lookup, linkNames(lookup)) : []
}

/** Which link this is, for keys and editing: its rule id, or its place for one not yet saved. */
export const linkKey = (link: DishLink, index: number): string => (link.ruleId !== undefined ? String(link.ruleId) : `new-${index}`)

/** An old "only with" link to sides: it only limits, where a link to sides now brings the dish. */
const limitsOnly = (link: DishLink) => link.mode === 'with' && isSideTarget(link.target)

/** A dish's links as sentences, each editable in place, plus an "Add link" flow. */
export function LinkList({ dishName, componentType, selfId, links, offRuleIds = [], onChange, onEditingChange }: LinkListProps) {
  const lookup = useLibraryLookup()
  // The key of the link being edited (its rule id, so two links of one kind stay apart), 'adding' while adding, or null.
  const [editing, setEditing] = useState<string | null>(null)
  const open = editing !== null
  useEffect(() => {
    onEditingChange?.(open)
    return () => onEditingChange?.(false)
  }, [open, onEditingChange])
  const names = linkNames(lookup)
  // Nothing is known about the library until it has loaded, so every link would look unpairable.
  const warnings = useLinkWarnings({ id: selfId, name: dishName, componentType }, links)
  // Editing before the stored links have loaded would start from an empty list and drop them on save.
  const ready = lookup.loaded
  const name = dishName.trim() || 'This dish'
  // "Comes with" may be added again and again, so only other kinds of link run out.
  const slotsLeft = addableSlots(componentType, links).length > 0 || LINK_TARGETS.some((t) => offersComes(componentType, t))

  // The editor reads this lookup rather than starting its own, which would open with no options.
  const editor = (initial?: DishLink, index?: number) => (
    <ShareLibraryLookup value={lookup}>
      <LinkEditor
        componentType={componentType}
        selfId={selfId}
        dishName={dishName}
        initial={initial}
        links={links}
        onCancel={() => setEditing(null)}
        onDone={(link) => {
          // An edited link keeps the rule id of the one it replaces, so saving rewrites that rule.
          const edited = initial?.ruleId === undefined ? link : { ...link, ruleId: initial.ruleId }
          onChange(initial === undefined ? [...links, link] : links.map((l, i) => (i === index ? edited : l)))
          setEditing(null)
        }}
      />
    </ShareLibraryLookup>
  )

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold">Goes with</span>
      {links.length === 0 && editing !== 'adding' && <p className="text-xs text-muted-foreground">Goes with anything.</p>}
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link, i) => (
            <li key={linkKey(link, i)} className="text-xs">
              {editing === linkKey(link, i) ? editor(link, i) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1">
                    {describeLink(name, link, names)}
                    {limitsOnly(link) && ' (only limits: edit it to have it come with the meal)'}
                    {link.ruleId !== undefined && offRuleIds.includes(link.ruleId) && ' (off)'}
                  </span>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null} onClick={() => setEditing(linkKey(link, i))}>Edit</Button>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null}
                    onClick={() => onChange(links.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              )}
              {editing !== linkKey(link, i) && warnings.filter((w) => w.link === i).map((w) => (
                <p key={w.message} role={w.blocking ? 'alert' : undefined}
                  className={w.blocking ? 'font-medium text-destructive' : 'text-amber-700 dark:text-amber-400'}>{w.message}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {editing === 'adding' && editor()}
      {editing === null && slotsLeft && (
        <Button type="button" variant="outline" size="sm" disabled={!ready} onClick={() => setEditing('adding')}>Add link</Button>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { addableSlots, describeLink, linkWarnings, linkSlotOf, type DishLink } from '@/rules'
import type { ComponentType } from '@/types/component'
import { linkNames, ShareLibraryLookup, useLibraryLookup } from '../LibraryLookup'
import { LinkEditor } from './LinkEditor'

interface LinkListProps {
  dishName: string
  componentType: ComponentType
  selfId?: number
  links: DishLink[]
  /** Slots of links that are stored switched off; they are shown marked "(off)". */
  offSlots?: readonly string[]
  onChange: (links: DishLink[]) => void
  /** Tells the form whether a link is being built, so it can hold back Save. */
  onEditingChange?: (open: boolean) => void
}

/** A dish's links as sentences, each editable in place, plus an "Add link" flow. */
export function LinkList({ dishName, componentType, selfId, links, offSlots = [], onChange, onEditingChange }: LinkListProps) {
  const lookup = useLibraryLookup()
  // The slot of the link being edited (not its index, which shifts when the form re-syncs), 'new' while adding, or null.
  const [editing, setEditing] = useState<string | null>(null)
  const open = editing !== null
  useEffect(() => {
    onEditingChange?.(open)
    return () => onEditingChange?.(false)
  }, [open, onEditingChange])
  const names = linkNames(lookup)
  // Editing before the stored links have loaded would start from an empty list and drop them on save.
  const ready = lookup.loaded
  const name = dishName.trim() || 'This dish'
  // Nothing is known about the library until it has loaded, so every link would look unpairable.
  const warnings = ready ? linkWarnings({ id: selfId, name: dishName, componentType }, links, lookup, names) : []
  const slotsLeft = addableSlots(componentType, links).length > 0

  // The editor reads this lookup rather than starting its own, which would open with no options.
  const editor = (initial?: DishLink) => (
    <ShareLibraryLookup value={lookup}>
      <LinkEditor
        componentType={componentType}
        selfId={selfId}
        dishName={dishName}
        initial={initial}
        links={links}
        onCancel={() => setEditing(null)}
        onDone={(link) => {
          onChange(initial === undefined ? [...links, link] : links.map((l) => (linkSlotOf(l) === linkSlotOf(initial) ? link : l)))
          setEditing(null)
        }}
      />
    </ShareLibraryLookup>
  )

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold">Goes with</span>
      {links.length === 0 && editing !== 'new' && <p className="text-xs text-muted-foreground">Goes with anything.</p>}
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link, i) => (
            <li key={linkSlotOf(link)} className="text-xs">
              {editing === linkSlotOf(link) ? editor(link) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1">{describeLink(name, link, names)}{offSlots.includes(linkSlotOf(link)) && ' (off)'}</span>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null} onClick={() => setEditing(linkSlotOf(link))}>Edit</Button>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null}
                    onClick={() => onChange(links.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              )}
              {editing !== linkSlotOf(link) && warnings.filter((w) => w.link === i).map((w) => (
                <p key={w.message} className="text-amber-700 dark:text-amber-400">{w.message}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' && editor()}
      {editing === null && slotsLeft && (
        <Button type="button" variant="outline" size="sm" disabled={!ready} onClick={() => setEditing('new')}>Add link</Button>
      )}
    </div>
  )
}

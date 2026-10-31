'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeLink, LINK_TARGETS, linkSlotOf, offersLink, type DishLink } from '@/rules'
import type { ComponentType } from '@/types/component'
import { linkNames, useLibraryLookup } from '../LibraryLookup'
import { LinkEditor } from './LinkEditor'

interface LinkListProps {
  dishName: string
  componentType: ComponentType
  selfId?: number
  links: DishLink[]
  onChange: (links: DishLink[]) => void
}

/** A dish's links as sentences, each editable in place, plus an "Add link" flow. */
export function LinkList({ dishName, componentType, selfId, links, onChange }: LinkListProps) {
  const lookup = useLibraryLookup()
  // The index being edited, 'new' while adding, or null.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const names = linkNames(lookup)
  const name = dishName.trim() || 'This dish'
  const taken = links.map(linkSlotOf)
  const slotsLeft = LINK_TARGETS.some((t) => offersLink(componentType, t) && (['with', 'never'] as const).some((mode) => !taken.includes(linkSlotOf({ mode, target: t }))))
  // Editing before the stored links have loaded would start from an empty list and drop them on save.
  const ready = lookup.loaded

  const editor = (initial?: DishLink, at?: number) => (
    <LinkEditor
      componentType={componentType}
      selfId={selfId}
      dishName={dishName}
      initial={initial}
      taken={taken}
      onCancel={() => setEditing(null)}
      onDone={(link) => {
        onChange(at === undefined ? [...links, link] : links.map((l, i) => (i === at ? link : l)))
        setEditing(null)
      }}
    />
  )

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold">Goes with</span>
      {links.length === 0 && editing !== 'new' && <p className="text-xs text-muted-foreground">Goes with anything.</p>}
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link, i) => (
            <li key={linkSlotOf(link)} className="text-xs">
              {editing === i ? editor(link, i) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1">{describeLink(name, link, names)}</span>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null} onClick={() => setEditing(i)}>Edit</Button>
                  <Button type="button" variant="ghost" size="xs" disabled={!ready || editing !== null}
                    onClick={() => onChange(links.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              )}
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

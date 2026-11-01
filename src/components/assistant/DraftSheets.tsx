'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import type { AssistantEffect } from '@/assistant/types'
import { db } from '@/db/client'
import type { DishLink, Draft } from '@/rules'
import { ComponentForm } from '@/components/library/ComponentForm'
import { RuleEditor } from '@/components/rules/editor/RuleEditor'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type DishDraft = Extract<AssistantEffect, { kind: 'dish-draft' }>['draft']

export type Review =
  | { kind: 'rule'; draft: Draft; id: number }
  | { kind: 'dish'; draft: DishDraft; links?: DishLink[]; id: number }
  | { kind: 'pairing'; dishId: number; links: DishLink[]; id: number }

/** The stored dish's own form with the drafted links merged over its links. */
function PairingForm({ dishId, links, onClose }: { dishId: number; links: DishLink[]; onClose: () => void }) {
  // null while loading; undefined once the dish turns out to be gone.
  const component = useLiveQuery(() => db.components.get(dishId), [dishId], null)
  if (component === null) return null
  if (!component) return <p className="text-sm text-muted-foreground">This dish is no longer in the library.</p>
  return (
    <ComponentForm
      component={component}
      componentType={component.componentType}
      mode="edit"
      draftLinks={links}
      onSave={onClose}
      onDiscard={onClose}
    />
  )
}

/** Opens an assistant draft in the normal editor. Nothing is stored except by that editor's own Save. */
export function DraftSheets({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const close = (open: boolean) => { if (!open) onClose() }
  return (
    <>
      <Sheet open={review?.kind === 'rule'} onOpenChange={close}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review rule</SheetTitle>
            <SheetDescription>Drafted by the assistant. It is only added when you save it.</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            {review?.kind === 'rule' && (
              <RuleEditor key={review.id} initial={review.draft} onSaved={onClose} onCancel={onClose} />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={review?.kind === 'dish'} onOpenChange={close}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review dish</SheetTitle>
            <SheetDescription>Drafted by the assistant. It is only added when you save it.</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            {/* The form reads its draft only when it mounts, so each review gets a fresh one. */}
            {review?.kind === 'dish' && (
              <ComponentForm
                key={review.id}
                mode="add"
                componentType={review.draft.componentType}
                draft={review.draft}
                draftLinks={review.links}
                onSave={onClose}
                onDiscard={onClose}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={review?.kind === 'pairing'} onOpenChange={close}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review pairing</SheetTitle>
            <SheetDescription>Drafted by the assistant. Nothing changes until you save the dish.</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            {review?.kind === 'pairing' && (
              <PairingForm key={review.id} dishId={review.dishId} links={review.links} onClose={onClose} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

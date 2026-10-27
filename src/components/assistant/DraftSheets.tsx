'use client'

import type { AssistantEffect } from '@/assistant/types'
import type { Draft } from '@/rules'
import { ComponentForm } from '@/components/library/ComponentForm'
import { RuleEditor } from '@/components/rules/editor/RuleEditor'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type DishDraft = Extract<AssistantEffect, { kind: 'dish-draft' }>['draft']

export type Review =
  | { kind: 'rule'; draft: Draft; id: number }
  | { kind: 'dish'; draft: DishDraft; id: number }

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
                onSave={onClose}
                onDiscard={onClose}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

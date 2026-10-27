'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AssistantPanel } from './AssistantPanel'

/** "Ask assistant" button and its side sheet; lives in the app nav so every page has it. */
export function AssistantButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4 mr-2" />
        Ask assistant
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Rules assistant</SheetTitle>
            <SheetDescription>Ask about your rules, dishes and plan. Drafts are only saved when you review and save them.</SheetDescription>
          </SheetHeader>
          {/* Mounted only while open: closing drops the conversation and cancels a running request. */}
          <div className="min-h-0 flex-1 px-6 pb-6">{open && <AssistantPanel />}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}

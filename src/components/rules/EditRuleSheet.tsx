'use client'

import type { RuleRecord } from '@/db/client'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RuleEditor } from './editor/RuleEditor'

export function EditRuleSheet({ rule, open, onOpenChange }: {
  rule: RuleRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit rule</SheetTitle>
          <SheetDescription>Changes apply the next time a plan is generated.</SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          {/* Mounted only while open, so it always starts from the stored rule. */}
          {open && (
            <RuleEditor
              ruleId={rule.id}
              initial={{ name: rule.name, spec: rule.spec }}
              onSaved={() => onOpenChange(false)}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

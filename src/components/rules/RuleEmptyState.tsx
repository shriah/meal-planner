'use client'

import { RulePresetList } from './RulePresetList'

export function RuleEmptyState() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold font-heading">No rules yet</h2>
      <p className="text-sm text-muted-foreground">
        Rules shape what the planner puts on the menu. Add one of these to start:
      </p>
      <RulePresetList />
    </div>
  )
}

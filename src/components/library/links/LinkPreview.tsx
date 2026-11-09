'use client'

import { useEffect, useState } from 'react'
import type { Comparison } from '@/assistant/types'
import type { LinkChange, OwnedRuleChanges } from '@/rules'
import { COMPARE_SEED, compareRuleSets, pendingRules } from '@/services/compare-rules'
import { loadPlanningInput, runPlanning } from '@/services/planning'
import { pinsFromLocks } from '@/services/pins'
import { usePlanStore } from '@/stores/plan-store'
import { Button } from '@/components/ui/button'
import { ComparisonView } from '@/components/assistant/ComparisonView'

interface LinkPreviewProps {
  /** The dish being edited; undefined while adding one, which has nothing to compare yet. */
  dishId: number | undefined
  dishName: string
  /** The days, meals and never-auto changes saving the form would write. */
  changes: OwnedRuleChanges
  /** The link changes saving the form would write. */
  links?: readonly LinkChange[]
  /** Injectable so tests never plan for real. */
  run?: typeof runPlanning
}

/** What the changes would build, so a result shown for older form values is not mistaken for the current ones. */
function changesKey(dishId: number, dishName: string, changes: OwnedRuleChanges, links: readonly LinkChange[]) {
  return JSON.stringify([Object.entries(changes).map(([slot, build]) => [slot, build ? build({ id: dishId, name: dishName }) : build]), dishName, links])
}

/** Plans this week with and without the form's unsaved rule changes, on request: planning twice is slow. */
export function LinkPreview({ dishId, dishName, changes, links = [], run = runPlanning }: LinkPreviewProps) {
  const plan = usePlanStore((s) => s.plan)
  const hydrated = usePlanStore((s) => s.hydrated)
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<{ key: string; comparison: Comparison; names: Map<number, string> } | null>(null)

  // Opened straight on /library, nothing has loaded the plan yet.
  useEffect(() => {
    if (!hydrated) usePlanStore.getState().initFromDB()
  }, [hydrated])

  if (dishId === undefined || !plan) return null
  const key = changesKey(dishId, dishName, changes, links)
  const shown = result?.key === key ? result : null

  async function preview(id: number) {
    setRunning(true)
    setFailed(false)
    try {
      const input = await loadPlanningInput()
      const { plan: current, locks } = usePlanStore.getState()
      const pins = current ? pinsFromLocks(current, locks) : undefined
      const after = pendingRules(input.rules, id, changes, dishName, links)
      const comparison = await compareRuleSets(input, after, { seed: COMPARE_SEED, pins, touches: (c) => c === id }, run)
      setResult({ key, comparison, names: new Map(input.library.map((c) => [c.id, c.name])) })
    } catch {
      setFailed(true)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" disabled={running} onClick={() => preview(dishId)}>
        {running ? 'Planning…' : 'Preview on this week'}
      </Button>
      {failed && <p role="alert" className="text-xs text-destructive">Could not plan the week. Try again.</p>}
      {shown && (shown.comparison.identical && !shown.comparison.worse
        ? <p className="text-xs text-muted-foreground">This would not change the week.</p>
        : <ComparisonView comparison={shown.comparison} names={shown.names} />)}
    </div>
  )
}

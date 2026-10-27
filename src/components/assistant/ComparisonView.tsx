'use client'

import { DAYS, MEALS } from '@/planner'
import type { Comparison } from '@/assistant/types'
import type { PlanSlot, WeeklyPlan } from '@/types/plan'
import { cn } from '@/lib/utils'

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function slotText(slot: PlanSlot | undefined, names: Map<number, string>): string {
  if (!slot) return '—'
  const name = (id: number) => names.get(id) ?? `#${id}`
  const ids = [slot.base_id, slot.curry_id, slot.subzi_id, ...slot.extra_ids].filter((id): id is number => id !== undefined)
  return ids.map(name).join(', ') || '—'
}

function WeekTable({ title, plan, changed, names }: {
  title: string
  plan: WeeklyPlan
  changed: Set<string>
  names: Map<number, string>
}) {
  const slots = new Map(plan.slots.map((s) => [`${s.day}-${s.meal_slot}`, s]))
  return (
    <table aria-label={title} className="w-full table-fixed border-collapse text-xs">
      <caption className="mb-1 text-left text-sm font-semibold">{title}</caption>
      <thead>
        <tr>
          <th className="w-12 p-1 text-left font-medium text-muted-foreground" scope="col"><span className="sr-only">Day</span></th>
          {MEALS.map((m) => <th key={m} scope="col" className="p-1 text-left font-medium text-muted-foreground">{label(m)}</th>)}
        </tr>
      </thead>
      <tbody>
        {DAYS.map((d) => (
          <tr key={d} className="border-t">
            <th scope="row" className="p-1 text-left align-top font-medium">{label(d).slice(0, 3)}</th>
            {MEALS.map((m) => {
              const isChanged = changed.has(`${d}-${m}`)
              return (
                <td
                  key={m}
                  data-changed={isChanged ? 'true' : undefined}
                  className={cn('p-1 align-top break-words', isChanged && 'bg-amber-100 font-medium dark:bg-amber-900/40')}
                >
                  {slotText(slots.get(`${d}-${m}`), names)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The sample week with and without the draft rule, side by side. Shown for review only; it never blocks saving. */
export function ComparisonView({ comparison, names }: { comparison: Comparison; names: Map<number, string> }) {
  const changed = new Set(comparison.changes.map((c) => `${c.day}-${c.meal}`))
  const count = comparison.changes.length
  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        {comparison.identical ? 'The sample week does not change.' : `${count} ${count === 1 ? 'meal changes' : 'meals change'} in the sample week (highlighted).`}
      </p>
      {comparison.worse && (
        <p role="alert" className="text-xs font-medium text-destructive">
          Warning: this rule makes the week worse.{' '}
          {comparison.newHardProblems.slice(0, 3).map((p) => p.message).join(' ')}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <WeekTable title="Before" plan={comparison.before} changed={changed} names={names} />
        <WeekTable title="After" plan={comparison.after} changed={changed} names={names} />
      </div>
    </div>
  )
}

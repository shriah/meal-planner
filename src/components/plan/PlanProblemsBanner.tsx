'use client'

import { X, AlertTriangle } from 'lucide-react'
import { usePlanStore } from '@/stores/plan-store'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Explains what the last generated plan could not do: broken rules and rules that were skipped. */
export function PlanProblemsBanner() {
  const problems = usePlanStore(s => s.problems)
  const ruleIssues = usePlanStore(s => s.ruleIssues)
  const dismissed = usePlanStore(s => s.problemsDismissed)
  const dismiss = usePlanStore(s => s.dismissProblems)

  const broken = problems.filter(p => p.level === 'hard')
  if (dismissed || (broken.length === 0 && ruleIssues.length === 0)) return null

  const summary = [
    broken.length > 0 && `${plural(broken.length, 'rule could not be met', 'rules could not be met')} — see highlighted meals`,
    ruleIssues.length > 0 && `${plural(ruleIssues.length, 'rule was skipped', 'rules were skipped')}`,
  ].filter(Boolean).join('; ')

  return (
    <div role="status" className="flex items-start gap-3 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
      <details className="flex-1">
        <summary className="cursor-pointer">{summary}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {broken.map((p, i) => <li key={`p${i}`}>{p.message}</li>)}
          {ruleIssues.map((issue) => <li key={`r${issue.ruleId}`}>Skipped “{issue.name}”: {issue.message}</li>)}
        </ul>
      </details>
      <button onClick={dismiss} className="shrink-0 p-1 hover:bg-amber-100 rounded" aria-label="Dismiss plan problems">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

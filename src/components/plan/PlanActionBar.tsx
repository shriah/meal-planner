'use client'

import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/plan-store'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllComponents } from '@/services/food-db'

export function PlanActionBar() {
  const plan = usePlanStore(s => s.plan)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const regenerate = usePlanStore(s => s.regenerate)
  const generateFresh = usePlanStore(s => s.generateFresh)
  const isReadOnly = usePlanStore(s => s.isReadOnly)
  const isExporting = usePlanStore(s => s.isExporting)
  const exportError = usePlanStore(s => s.exportError)
  const exportPlan = usePlanStore(s => s.exportPlan)

  const hasPlan = plan !== null && plan.slots.length > 0
  const label = isGenerating ? 'Generating...' : hasPlan ? 'Regenerate Plan' : 'Generate Plan'
  const handleClick = hasPlan ? regenerate : generateFresh

  const allComponents = useLiveQuery(() => getAllComponents(), [], [])
  const handleExport = () => {
    const names: Record<number, string> = {}
    for (const c of allComponents ?? []) {
      if (c.id !== undefined) names[c.id] = c.name
    }
    exportPlan(names)
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button
          variant="default"
          onClick={handleExport}
          disabled={!hasPlan || isExporting}
        >
          <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
          {isExporting ? 'Exporting...' : 'Export PNG'}
        </Button>
        {!isReadOnly && (
          <Button onClick={handleClick} disabled={isGenerating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            {label}
          </Button>
        )}
      </div>
      {exportError && (
        <p className="text-sm text-destructive mt-1">Export failed. Try again.</p>
      )}
    </>
  )
}

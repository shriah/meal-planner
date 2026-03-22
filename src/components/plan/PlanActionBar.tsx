'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanStore } from '@/stores/plan-store'

export function PlanActionBar() {
  const plan = usePlanStore(s => s.plan)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const regenerate = usePlanStore(s => s.regenerate)
  const generateFresh = usePlanStore(s => s.generateFresh)
  const isReadOnly = usePlanStore(s => s.isReadOnly)

  const hasPlan = plan !== null
  const label = isGenerating ? 'Generating...' : hasPlan ? 'Regenerate Plan' : 'Generate Plan'
  const handleClick = hasPlan ? regenerate : generateFresh

  return (
    <div className="flex items-center gap-4">
      {!isReadOnly && (
        <Button onClick={handleClick} disabled={isGenerating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
          {label}
        </Button>
      )}
    </div>
  )
}

'use client'

import { X, AlertTriangle } from 'lucide-react'
import { usePlanStore } from '@/stores/plan-store'

export function WarningBanner() {
  const warnings = usePlanStore(s => s.warnings)
  const dismissed = usePlanStore(s => s.warningBannerDismissed)
  const dismiss = usePlanStore(s => s.dismissWarningBanner)

  if (dismissed || warnings.length === 0) return null

  const msg = warnings.length === 1
    ? '1 slot could not be filled \u2014 see highlighted cell'
    : `${warnings.length} slots could not be filled \u2014 see highlighted cells`

  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
      <span className="flex-1">{msg}</span>
      <button onClick={dismiss} className="shrink-0 p-1 hover:bg-amber-100 rounded" aria-label="Dismiss warnings">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

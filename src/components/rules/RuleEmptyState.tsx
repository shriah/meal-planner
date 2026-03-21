'use client'

import { useRouter } from 'next/navigation'

const PRESETS = [
  {
    id: 'fish-fridays',
    name: 'Fish Fridays',
    description: 'Requires fish protein on Fridays',
  },
  {
    id: 'no-repeat-subzi',
    name: 'No repeat subzi',
    description: 'No repeated subzi within the week',
  },
  {
    id: 'weekend-special',
    name: 'Weekend special',
    description: 'Filters for weekend occasion on Saturday and Sunday',
  },
]

export function RuleEmptyState() {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold font-heading">No rules yet</h2>
      <p className="text-sm text-muted-foreground">
        Rules let you control what meals appear on specific days. Try one of these examples:
      </p>
      <div className="space-y-3">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => router.push(`/rules/new?preset=${preset.id}`)}
            className="w-full text-left p-4 rounded-lg border border-border opacity-50 hover:opacity-80 cursor-pointer transition-opacity"
          >
            <p className="text-sm font-medium">{preset.name}</p>
            <p className="text-sm text-muted-foreground">{preset.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

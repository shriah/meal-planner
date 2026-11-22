'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { addRule } from '@/services/food-db'
import { getParts } from '@/services/parts-db'
import { describeSpec, libraryNames, parseSpec } from '@/rules'
import { rulePresets, type RulePreset } from './presets'

/** Ready-made rules. By default a click adds the rule; with `onPick` it hands the preset over instead. */
export function RulePresetList({ onPick }: { onPick?: (preset: RulePreset) => void }) {
  const parts = useLiveQuery(getParts)

  async function pick(preset: RulePreset) {
    if (onPick) return onPick(preset)
    await addRule({ name: preset.name, enabled: true, spec: preset.spec, created_at: new Date().toISOString() })
    toast.success(`Rule “${preset.name}” added`)
  }

  // The presets name parts, so they wait for them.
  if (!parts) return null
  const names = libraryNames({ dishes: [], categories: [], parts })

  return (
    <div className="space-y-3">
      {rulePresets(parts).map((preset) => {
        const parsed = parseSpec(preset.spec)
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => void pick(preset)}
            className="w-full text-left p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <p className="text-sm font-medium">{preset.name}</p>
            {parsed.ok && <p className="text-sm text-muted-foreground">{describeSpec(parsed.spec, names)}</p>}
          </button>
        )
      })}
    </div>
  )
}

'use client'

import { addRule } from '@/services/food-db'
import { describeSpec, parseSpec } from '@/rules'
import { RULE_PRESETS } from './presets'

/** One-click starter rules. */
export function RulePresetList({ onAdded }: { onAdded?: () => void }) {
  async function add(name: string, spec: (typeof RULE_PRESETS)[number]['spec']) {
    await addRule({ name, enabled: true, spec, created_at: new Date().toISOString() })
    onAdded?.()
  }

  return (
    <div className="space-y-3">
      {RULE_PRESETS.map((preset) => {
        const parsed = parseSpec(preset.spec)
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => add(preset.name, preset.spec)}
            className="w-full text-left p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <p className="text-sm font-medium">{preset.name}</p>
            {parsed.ok && <p className="text-sm text-muted-foreground">{describeSpec(parsed.spec)}</p>}
          </button>
        )
      })}
    </div>
  )
}

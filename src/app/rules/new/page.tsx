'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Draft } from '@/rules'
import { RuleEditor } from '@/components/rules/editor/RuleEditor'
import { RulePresetList } from '@/components/rules/RulePresetList'
import { Separator } from '@/components/ui/separator'

export default function NewRulePage() {
  const router = useRouter()
  // Picking a preset remounts the editor with that preset as its starting point.
  const [start, setStart] = useState<{ key: number; draft?: Draft }>({ key: 0 })

  return (
    <main className="px-4 py-8 sm:px-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <h1 className="text-[28px] font-semibold font-heading">Add a rule</h1>
        <RuleEditor
          key={start.key}
          initial={start.draft}
          onSaved={() => router.push('/rules')}
          onCancel={() => router.push('/rules')}
        />
      </section>
      <aside className="space-y-3">
        <Separator className="lg:hidden" />
        <h2 className="text-sm font-semibold">Start from a ready-made rule</h2>
        <RulePresetList onPick={(preset) => setStart((s) => ({ key: s.key + 1, draft: { name: preset.name, spec: preset.spec } }))} />
      </aside>
    </main>
  )
}

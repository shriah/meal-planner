'use client'

import { useRouter } from 'next/navigation'
import { RulePresetList } from '@/components/rules/RulePresetList'

export default function NewRulePage() {
  const router = useRouter()
  return (
    <main className="px-4 py-8 sm:px-8 space-y-4">
      <h1 className="text-[28px] font-semibold font-heading">Add a rule</h1>
      <p className="text-sm text-muted-foreground">
        The rule editor is being rebuilt for the new planner. Until it is back, add one of these ready-made rules:
      </p>
      <RulePresetList onAdded={() => router.push('/rules')} />
    </main>
  )
}

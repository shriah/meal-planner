'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ComponentTab } from './ComponentTab'
import type { ComponentType } from '@/types/component'

const TABS: { value: ComponentType; label: string }[] = [
  { value: 'base', label: 'Bases' },
  { value: 'curry', label: 'Curries' },
  { value: 'subzi', label: 'Subzis' },
  { value: 'extra', label: 'Extras' },
]

export function ComponentLibrary() {
  return (
    <div className="min-w-80 px-4 py-8 sm:px-8">
      <h1 className="text-[28px] font-semibold leading-[1.2] mb-6">Component Library</h1>
      <Tabs defaultValue="base">
        <TabsList>
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(tab => (
          <TabsContent key={tab.value} value={tab.value}>
            <ComponentTab type={tab.value} label={tab.label} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

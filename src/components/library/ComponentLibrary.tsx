'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/client'
import { parseHash, useUrlHash } from '@/lib/hash-target'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryManager } from './CategoryManager'
import { ComponentTab } from './ComponentTab'
import type { ComponentType } from '@/types/component'

const TABS: { value: ComponentType; label: string }[] = [
  { value: 'base', label: 'Bases' },
  { value: 'curry', label: 'Curries' },
  { value: 'subzi', label: 'Subzis' },
  { value: 'extra', label: 'Extras' },
]

export function ComponentLibrary() {
  // A deep link (`/library#dish-3`) opens the tab of that dish and expands it.
  const hash = useUrlHash()
  const dishId = parseHash(hash).dish
  const dish = useLiveQuery(() => (dishId === undefined ? undefined : db.components.get(dishId)), [dishId])
  const [picked, setPicked] = useState<{ forHash: string; tab: ComponentType } | null>(null)
  // Remember where the dish was found, so deleting it does not move the user to another tab.
  const [found, setFound] = useState<{ forHash: string; tab: ComponentType } | null>(null)
  if (dish && (found?.forHash !== hash || found.tab !== dish.componentType)) {
    setFound({ forHash: hash, tab: dish.componentType })
  }
  const dishTab = found?.forHash === hash ? found.tab : undefined
  const tab = picked?.forHash === hash ? picked.tab : dishTab ?? 'base'

  return (
    <div className="min-w-80 px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold leading-[1.2]">Component Library</h1>
        <CategoryManager />
      </div>
      <Tabs value={tab} onValueChange={(value) => setPicked({ forHash: hash, tab: value as ComponentType })}>
        <TabsList>
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value}>
            <ComponentTab type={t.value} label={t.label} focusId={dishTab === t.value ? dishId : undefined} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

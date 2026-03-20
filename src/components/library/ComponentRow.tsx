'use client'

import type { ComponentRecord } from '@/types/component'

interface ComponentRowProps {
  component: ComponentRecord
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onDelete: () => void
}

export function ComponentRow(_props: ComponentRowProps) {
  return null
}

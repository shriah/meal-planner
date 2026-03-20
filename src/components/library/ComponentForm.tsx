'use client'

import type { ComponentRecord, ComponentType } from '@/types/component'

interface ComponentFormProps {
  component?: ComponentRecord
  componentType: ComponentType
  onSave: () => void
  onDiscard: () => void
  mode: 'edit' | 'add'
}

export function ComponentForm(_props: ComponentFormProps) {
  return null
}

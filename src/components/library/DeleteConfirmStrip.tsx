'use client'

import { useState } from 'react'
import { deleteComponent } from '@/services/food-db'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface DeleteConfirmStripProps {
  componentName: string
  componentId: number
  onDeleted: () => void
  onCancel: () => void
}

export function DeleteConfirmStrip({
  componentName,
  componentId,
  onDeleted,
  onCancel,
}: DeleteConfirmStripProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteComponent(componentId)
      onDeleted()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <Alert variant="destructive" className="mt-1 flex items-center justify-between gap-2">
      <span className="text-xs">
        Delete {componentName}? This cannot be undone.
      </span>
      <div className="flex gap-2 shrink-0">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
        >
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={deleting}
        >
          Keep {componentName}
        </Button>
      </div>
    </Alert>
  )
}

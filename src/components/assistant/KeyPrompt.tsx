'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Paste, change or remove the user's Gemini key, with a plain notice of where it lives and what is sent. */
export function KeyPrompt({ hasKey, onSave, onRemove, onCancel }: {
  hasKey: boolean
  onSave: (key: string) => void
  onRemove: () => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState('')

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value)
      }}
    >
      <h3 className="text-sm font-semibold">{hasKey ? 'Change your Gemini key' : 'Add your Gemini key'}</h3>
      <p className="text-sm text-muted-foreground">
        Your key is kept in this browser in plain text. The relevant parts of your library (dishes, rules and the
        plan) are sent to Google with each question.
      </p>
      <div className="space-y-1">
        <Label htmlFor="gemini-key">Gemini API key</Label>
        <Input
          id="gemini-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!value.trim()}>Save key</Button>
        {hasKey && <Button type="button" variant="outline" onClick={onRemove}>Remove key</Button>}
        {hasKey && onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

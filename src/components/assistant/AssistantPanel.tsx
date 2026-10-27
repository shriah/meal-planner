'use client'

import { useEffect, useRef, useState } from 'react'
import { runAssistant } from '@/assistant/agent'
import { makeCompare } from '@/assistant/compare'
import { streamGemini, type GeminiCall, type GeminiContent } from '@/assistant/gemini'
import { clearApiKey, getApiKey, setApiKey } from '@/assistant/key-store'
import { MAX_INPUT_CHARS, clampMessage, createRateLimiter } from '@/assistant/limits'
import type { AssistantData } from '@/assistant/retrieve'
import type { AssistantEffect } from '@/assistant/types'
import { loadPlanningInput } from '@/services/planning'
import { pinsFromLocks } from '@/services/pins'
import { usePlanStore } from '@/stores/plan-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ComparisonView } from './ComparisonView'
import { DraftSheets, type Review } from './DraftSheets'
import { KeyPrompt } from './KeyPrompt'

type Entry =
  | { id: number; role: 'user' | 'error'; text: string }
  | { id: number; role: 'assistant'; text: string; effects: AssistantEffect[] }

const UNEXPECTED_ERROR = 'Something went wrong. Try again.'

/**
 * Chat about rules, dishes and the plan. Everything runs in this browser with the user's own key; the
 * guardrails in src/assistant keep it on topic but cannot stop a user who edits the page.
 * Text is always rendered as plain React text, never as HTML or markdown.
 * `gemini` is injectable so tests never reach the network.
 */
export function AssistantPanel({ gemini = streamGemini }: { gemini?: GeminiCall }) {
  const [apiKey, setKey] = useState<string | null>(() => getApiKey())
  const [editingKey, setEditingKey] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [names, setNames] = useState<Map<number, string>>(() => new Map())
  const [review, setReview] = useState<Review | null>(null)

  // Text-only turns of this open panel; dropped when the panel closes.
  const history = useRef<GeminiContent[]>([])
  const limiter = useRef(createRateLimiter())
  const abort = useRef<AbortController | null>(null)
  const nextId = useRef(0)
  const newId = () => ++nextId.current

  // Closing the panel unmounts it, which cancels any request still running.
  useEffect(() => () => abort.current?.abort(), [])

  function updateReply(id: number, change: (e: Extract<Entry, { role: 'assistant' }>) => Entry) {
    setEntries((all) => all.map((e) => (e.id === id && e.role === 'assistant' ? change(e) : e)))
  }

  async function submit() {
    const message = clampMessage(text)
    if (!message || running || !apiKey) return
    const controller = new AbortController()
    abort.current = controller
    const replyId = newId()
    setText('')
    setRunning(true)
    setEntries((all) => [...all, { id: newId(), role: 'user', text: message }, { id: replyId, role: 'assistant', text: '', effects: [] }])

    let reply = ''
    let finished = false
    try {
      const input = await loadPlanningInput()
      const { plan, locks } = usePlanStore.getState()
      const data: AssistantData = plan ? { ...input, plan } : input
      setNames(new Map(input.library.map((c) => [c.id, c.name])))
      const compare = makeCompare(data, plan ? pinsFromLocks(plan, locks) : undefined)
      const events = runAssistant(
        { message, history: history.current, data, apiKey, signal: controller.signal },
        { gemini, limiter: limiter.current, compare },
      )
      for await (const ev of events) {
        if (ev.type === 'text') {
          reply += ev.text
          updateReply(replyId, (e) => ({ ...e, text: e.text + ev.text }))
        } else if (ev.type === 'effect') {
          updateReply(replyId, (e) => ({ ...e, effects: [...e.effects, ev.effect] }))
        } else if (ev.type === 'error') {
          // An error ends the turn; a rate-limit refusal sends no 'done'.
          setEntries((all) => [...all, { id: newId(), role: 'error', text: ev.message }])
          break
        } else if (ev.type === 'done') {
          finished = true
        }
      }
    } catch {
      if (!controller.signal.aborted) setEntries((all) => [...all, { id: newId(), role: 'error', text: UNEXPECTED_ERROR }])
    } finally {
      if (abort.current === controller) abort.current = null
    }
    if (controller.signal.aborted) return
    if (finished && reply) {
      history.current = [
        ...history.current,
        { role: 'user', parts: [{ text: message }] },
        { role: 'model', parts: [{ text: reply }] },
      ]
    }
    setRunning(false)
  }

  if (!apiKey || editingKey) {
    return (
      <KeyPrompt
        hasKey={!!apiKey}
        onSave={(key) => {
          setApiKey(key)
          setKey(getApiKey())
          setEditingKey(false)
        }}
        onRemove={() => {
          abort.current?.abort()
          clearApiKey()
          setKey(null)
          setEditingKey(false)
          setRunning(false)
        }}
        onCancel={() => setEditingKey(false)}
      />
    )
  }

  const visible = entries.filter((e) => e.role !== 'assistant' || e.text || e.effects.length > 0)
  const waiting = running && entries[entries.length - 1]?.role === 'assistant' && !visible.includes(entries[entries.length - 1])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingKey(true)}>Gemini key</Button>
      </div>

      <div role="log" aria-label="Conversation" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about your rules, dishes or this week’s plan, or describe a rule you want. Nothing is saved until you
            review and save it.
          </p>
        )}
        {visible.map((e) => (
          <div
            key={e.id}
            className={cn(
              'rounded-md px-3 py-2 text-sm',
              e.role === 'user' && 'ml-8 bg-muted',
              e.role === 'assistant' && 'mr-4 border',
              e.role === 'error' && 'mr-4 border border-destructive/40 text-destructive',
            )}
          >
            {e.text && <p className="whitespace-pre-wrap break-words">{e.text}</p>}
            {e.role === 'assistant' && e.effects.map((effect, i) => (
              <div key={i} className="mt-2">
                {effect.kind === 'rule-draft' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rule draft: {effect.draft.name}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setReview({ kind: 'rule', draft: effect.draft, id: newId() })}>
                      Review rule
                    </Button>
                  </div>
                )}
                {effect.kind === 'dish-draft' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Dish draft: {effect.draft.name}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setReview({ kind: 'dish', draft: effect.draft, id: newId() })}>
                      Review dish
                    </Button>
                  </div>
                )}
                {effect.kind === 'comparison' && <ComparisonView comparison={effect.comparison} names={names} />}
              </div>
            ))}
          </div>
        ))}
        {waiting && <p role="status" className="text-sm text-muted-foreground">Thinking…</p>}
      </div>

      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <textarea
          aria-label="Ask the assistant"
          rows={3}
          maxLength={MAX_INPUT_CHARS}
          value={text}
          placeholder="e.g. Never serve paneer on weekdays"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{text.length}/{MAX_INPUT_CHARS}</span>
          <Button type="submit" size="sm" disabled={running || !text.trim()}>Send</Button>
        </div>
      </form>

      <DraftSheets review={review} onClose={() => setReview(null)} />
    </div>
  )
}

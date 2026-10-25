'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { db } from '@/db/client'
import { ROLES, type Matcher } from '@/planner'
import {
  describeSpec, newSpec, previewMatches, RuleSpecSchema, TEMPLATE_FORMS, TEMPLATE_GROUPS, TEMPLATES, validateDraft,
  type Draft, type FormField, type Names, type RuleSpecInput, type Scope, type TemplateId,
} from '@/rules'
import { addRule, updateRule } from '@/services/food-db'
import { checkDraftRule, type DraftCheck } from '@/services/planning'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConditionEditor, type EditorData } from './ConditionEditor'
import { DAY_OPTIONS, LevelSelect, MEAL_OPTIONS, MultiPicker, ScopePicker, ToggleGroup } from './widgets'

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r === 'subzi' ? 'Subzi' : r.charAt(0).toUpperCase() + r.slice(1) }))
const SKIP_OPTIONS = ROLE_OPTIONS.filter((o) => o.value !== 'base')

/** How long editing must pause before the draft is checked against the library. */
const CHECK_DELAY_MS = 600

interface RuleEditorProps {
  initial?: Draft
  /** Id of the stored rule being edited; omitted when creating. */
  ruleId?: number
  onSaved: () => void
  onCancel?: () => void
}

export function RuleEditor({ initial, ruleId, onSaved, onCancel }: RuleEditorProps) {
  // null until the user types: the name then follows what was stored (see `shownName`).
  const [typedName, setName] = useState<string | null>(null)
  const [spec, setSpec] = useState<RuleSpecInput>(initial?.spec ?? newSpec('exclude'))
  const [showErrors, setShowErrors] = useState(false)
  const [checked, setChecked] = useState<{ key: string; outcome: DraftCheck } | null>(null)

  const components = useLiveQuery(() => db.components.toArray(), [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const data: EditorData = useMemo(() => {
    const componentName = new Map(components.map((c) => [c.id, c.name]))
    const categoryName = new Map(categories.map((c) => [c.id, c.name]))
    const names: Names = { component: (id) => componentName.get(id), baseCategory: (id) => categoryName.get(id), extraCategory: (id) => categoryName.get(id) }
    return {
      components,
      baseCategories: categories.filter((c) => c.kind === 'base'),
      extraCategories: categories.filter((c) => c.kind === 'extra'),
      names,
    }
  }, [components, categories])

  // An empty name falls back to what the rule says, so a name is never needed.
  const parsedSpec = RuleSpecSchema.safeParse(spec)
  const suggestedName = parsedSpec.success ? describeSpec(parsedSpec.data, data.names) : ''
  // A rule saved without a name was stored under its description. Opening it leaves the name empty
  // again, so the name keeps following the rule if its conditions change.
  const initialParsed = initial ? RuleSpecSchema.safeParse(initial.spec) : undefined
  const initialWasUnnamed = !!initial && !!initialParsed?.success && initial.name === describeSpec(initialParsed.data, data.names)
  const shownName = typedName ?? (initialWasUnnamed ? '' : initial?.name ?? '')
  const result = validateDraft({ name: shownName.trim() || suggestedName, spec })
  const errors = !result.ok && showErrors ? result.errors : {}
  const params = spec.params as Record<string, unknown>

  const setParam = (key: string, value: unknown) => {
    const next = { ...params }
    if (value === undefined) delete next[key]
    else next[key] = value
    setSpec({ ...spec, params: next } as RuleSpecInput)
  }

  /** A cost is dropped when a rule becomes a must, so it never lingers unseen. */
  const setStrength = (strength: string) => {
    const next: Record<string, unknown> = { ...params, strength }
    if (strength === 'must') delete next.cost
    setSpec({ ...spec, params: next } as RuleSpecInput)
  }

  /** Switching type keeps the main condition when both types have one. */
  const changeTemplate = (template: TemplateId) => {
    const next = newSpec(template) as { template: TemplateId; params: Record<string, unknown> }
    for (const key of ['match', 'when'] as const) {
      const carried = params.match ?? params.when
      if (key in next.params && carried) next.params[key] = carried
    }
    setSpec(next as RuleSpecInput)
  }

  async function save() {
    setShowErrors(true)
    if (!result.ok) return
    if (ruleId === undefined) {
      await addRule({ name: result.name, enabled: true, spec: result.spec, created_at: new Date().toISOString() })
    } else {
      await updateRule(ruleId, { name: result.name, spec: result.spec })
    }
    onSaved()
  }

  // Check a valid draft against the library once editing pauses. A newer edit cancels the pending
  // check and discards a slower one still in flight, so a stale result never shows.
  const checkKey = result.ok ? JSON.stringify(result.spec) : null
  const check: DraftCheck | 'running' | null = !checkKey ? null : checked?.key === checkKey ? checked.outcome : 'running'
  useEffect(() => {
    if (!checkKey) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const outcome = await checkDraftRule({ name: 'draft', enabled: true, spec: JSON.parse(checkKey), created_at: '' }, ruleId)
      if (!cancelled) setChecked({ key: checkKey, outcome })
    }, CHECK_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [checkKey, ruleId])

  const renderField = (field: FormField) => {
    const v = params[field.key]
    switch (field.kind) {
      case 'match': {
        const matches = previewMatches(v as Matcher, components)
        return (
          <>
            <ConditionEditor label={field.label} value={v as Matcher} onChange={(m) => setParam(field.key, m)} data={data} />
            <p className="text-xs text-muted-foreground">
              {matches.length === 0
                ? 'Matches no dishes in your library yet.'
                : `Matches ${matches.length} ${matches.length === 1 ? 'dish' : 'dishes'}: ${matches.slice(0, 6).map((c) => c.name).join(', ')}${matches.length > 6 ? '…' : ''}`}
            </p>
          </>
        )
      }
      case 'scope':
        return <ScopePicker value={v as Scope | undefined} onChange={(s) => setParam(field.key, s)} />
      case 'roles':
        return <ToggleGroup label={field.label} options={ROLE_OPTIONS} value={(v as string[]) ?? []} onChange={(x) => setParam(field.key, x)} />
      case 'skip':
        return <ToggleGroup label={field.label} options={SKIP_OPTIONS} value={(v as string[]) ?? []} onChange={(x) => setParam(field.key, x)} />
      case 'meals':
        return <ToggleGroup label={field.label} options={MEAL_OPTIONS} value={(v as string[]) ?? []} onChange={(x) => setParam(field.key, x)} />
      case 'days':
        return <ToggleGroup label={field.label} options={DAY_OPTIONS} value={(v as string[]) ?? []} onChange={(x) => setParam(field.key, x.length ? x : undefined)} />
      case 'count':
        return (
          <Input
            type="number" min={field.key === 'min' && spec.template === 'require' ? 1 : 0} className="w-24" aria-label={field.label}
            value={v === undefined ? '' : String(v)}
            onChange={(e) => setParam(field.key, e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))))}
          />
        )
      case 'within':
        return (
          <Select value={String(v ?? 'week')} onValueChange={(x) => setParam(field.key, x === 'week' ? 'week' : Number(x))}>
            <SelectTrigger className="w-40" aria-label={field.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">the whole week</SelectItem>
              {[2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n} days</SelectItem>)}
            </SelectContent>
          </Select>
        )
      case 'per':
        return (
          <Select value={String(v)} onValueChange={(x) => setParam(field.key, x)}>
            <SelectTrigger className="w-32" aria-label={field.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="meal">meal</SelectItem>
              <SelectItem value="day">day</SelectItem>
              <SelectItem value="week">week</SelectItem>
            </SelectContent>
          </Select>
        )
      case 'direction':
        return (
          <Select value={String(v)} onValueChange={(x) => setParam(field.key, x)}>
            <SelectTrigger className="w-32" aria-label={field.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prefer">Prefer</SelectItem>
              <SelectItem value="avoid">Avoid</SelectItem>
            </SelectContent>
          </Select>
        )
      case 'weight':
        return (
          <LevelSelect label={field.label} kind="weight" value={(v as number | undefined) ?? 2}
            onChange={(n) => setParam(field.key, n)} />
        )
      case 'strength':
        return (
          <RadioGroup value={String(v ?? 'must')} onValueChange={(x) => setStrength(x)} className="flex gap-4" aria-label={field.label}>
            {[['must', 'Must'], ['prefer', 'Prefer']].map(([value, text]) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`strength-${value}`} />
                <Label htmlFor={`strength-${value}`} className="font-normal">{text}</Label>
              </div>
            ))}
          </RadioGroup>
        )
      case 'cost':
        return (
          // A cost of 10 is the default, so it is stored as no cost at all.
          <LevelSelect label={field.label} kind="cost" value={(v as number | undefined) ?? 10}
            onChange={(n) => setParam(field.key, n === 10 ? undefined : n)} />
        )
      case 'components':
        return (
          <MultiPicker label={field.label} value={(v as number[]) ?? []} onChange={(x) => setParam(field.key, x)}
            options={[...components].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: `${c.name} (${c.componentType})` }))} />
        )
      case 'baseCategories':
        return (
          <MultiPicker label={field.label} value={(v as number[]) ?? []} onChange={(x) => setParam(field.key, x)}
            options={data.baseCategories.map((c) => ({ value: c.id, label: c.name }))} />
        )
      case 'extraCategories':
        return (
          <MultiPicker label={field.label} value={(v as number[]) ?? []} onChange={(x) => setParam(field.key, x)}
            options={data.extraCategories.map((c) => ({ value: c.id, label: c.name }))} />
        )
    }
  }

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="space-y-1">
        <Label htmlFor="rule-name">Rule name<span className="text-muted-foreground font-normal"> (optional)</span></Label>
        <Input id="rule-name" value={shownName} placeholder={suggestedName} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label>Rule type</Label>
        <Select value={spec.template} onValueChange={(t) => changeTemplate(t as TemplateId)}>
          <SelectTrigger className="w-full" aria-label="Rule type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEMPLATE_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.templates.map((id) => <SelectItem key={id} value={id}>{TEMPLATES[id].label}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{TEMPLATES[spec.template].summary}</p>
      </div>

      {TEMPLATE_FORMS[spec.template].fields
        // A cost only means something for rules that may give way.
        .filter((field) => field.kind !== 'cost' || params.strength === 'prefer')
        .map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label>{field.label}{field.optional && <span className="text-muted-foreground font-normal"> (optional)</span>}</Label>
            {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            {renderField(field)}
            {errors[field.key] && <p className="text-xs text-destructive">{errors[field.key]}</p>}
          </div>
        ))}
      {errors.rule && <p className="text-xs text-destructive">{errors.rule}</p>}

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="text-xs text-muted-foreground mb-1">This rule says</p>
        <p>{result.ok ? describeSpec(result.spec, data.names) : 'Finish the rule to see its description.'}</p>
      </div>

      {check === 'running' && <p className="text-xs text-muted-foreground">Checking against your library…</p>}
      {check && check !== 'running' && <CheckResult check={check} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit">{ruleId === undefined ? 'Add rule' : 'Save changes'}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}

function CheckResult({ check }: { check: DraftCheck }) {
  if (check.draftIssue) {
    return <p className="text-sm text-destructive">This rule would be skipped: {check.draftIssue}</p>
  }
  const problems = [...check.draftProblems, ...check.otherProblems]
  if (problems.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4" /> The planner can meet this rule together with your other rules.
      </p>
    )
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" /> With this rule, the planner could not meet:
      </p>
      <ul className="list-disc pl-5 text-xs">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul>
    </div>
  )
}

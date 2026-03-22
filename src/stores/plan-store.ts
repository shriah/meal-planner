'use client'
import { create } from 'zustand'
import type { WeeklyPlan, Warning, DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'
import { getActivePlan } from '@/services/plan-db'
import { saveWeekPlan, getWeekPlan } from '@/services/plan-db'
import { getISOWeekStart, addWeeks, formatWeekLabel } from '@/services/week-utils'
import { generate } from '@/services/generator'
import type { GenerateOptions } from '@/services/generator'
import type { ExportPlanPayload } from '@/services/export-template'

type LockableComponent = 'base' | 'curry' | 'subzi' | 'extras'
export type LockKey = `${DayOfWeek}-${MealSlot}-${LockableComponent}`

interface PlanStore {
  plan: WeeklyPlan | null
  locks: Record<string, boolean>
  warnings: Warning[]
  isGenerating: boolean
  hydrated: boolean
  warningBannerDismissed: boolean
  currentWeekStart: string
  isReadOnly: boolean
  isExporting: boolean
  exportError: string | null

  initFromDB: () => Promise<void>
  setLock: (key: LockKey, locked: boolean) => void
  lockDay: (day: DayOfWeek) => void
  unlockDay: (day: DayOfWeek) => void
  swapComponent: (day: DayOfWeek, slot: MealSlot, componentType: LockableComponent, componentId: number) => void
  regenerate: () => Promise<void>
  generateFresh: () => Promise<void>
  dismissWarningBanner: () => void
  navigateToWeek: (weekStart: string) => Promise<void>
  exportPlan: (componentNames: Record<number, string>) => Promise<void>
}

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']
const ALL_LOCKABLE: LockableComponent[] = ['base', 'curry', 'subzi', 'extras']

export const usePlanStore = create<PlanStore>((set, get) => ({
  plan: null,
  locks: {},
  warnings: [],
  isGenerating: false,
  hydrated: false,
  warningBannerDismissed: false,
  currentWeekStart: getISOWeekStart(new Date()),
  isReadOnly: false,
  isExporting: false,
  exportError: null,

  initFromDB: async () => {
    const record = await getActivePlan()
    const currentWeekStart = getISOWeekStart(new Date())
    set({
      plan: record?.plan ?? null,
      locks: record?.locks ?? {},
      hydrated: true,
      currentWeekStart,
      isReadOnly: false,
    })
  },

  setLock: (key, locked) => {
    const newLocks = { ...get().locks, [key]: locked }
    set({ locks: newLocks })
    const { plan, currentWeekStart } = get()
    if (plan) saveWeekPlan(currentWeekStart, plan, newLocks)
  },

  lockDay: (day) => {
    const newLocks = { ...get().locks }
    for (const slot of ALL_SLOTS) {
      for (const comp of ALL_LOCKABLE) {
        newLocks[`${day}-${slot}-${comp}`] = true
      }
    }
    set({ locks: newLocks })
    const { plan, currentWeekStart } = get()
    if (plan) saveWeekPlan(currentWeekStart, plan, newLocks)
  },

  unlockDay: (day) => {
    const newLocks = { ...get().locks }
    for (const slot of ALL_SLOTS) {
      for (const comp of ALL_LOCKABLE) {
        newLocks[`${day}-${slot}-${comp}`] = false
      }
    }
    set({ locks: newLocks })
    const { plan, currentWeekStart } = get()
    if (plan) saveWeekPlan(currentWeekStart, plan, newLocks)
  },

  swapComponent: (day, slot, componentType, componentId) => {
    const { plan, locks, currentWeekStart } = get()
    if (!plan) return
    const slotIndex = plan.slots.findIndex(s => s.day === day && s.meal_slot === slot)
    if (slotIndex === -1) return
    const updatedSlots = [...plan.slots]
    const updatedSlot = { ...updatedSlots[slotIndex] }
    if (componentType === 'base') updatedSlot.base_id = componentId
    else if (componentType === 'curry') updatedSlot.curry_id = componentId
    else if (componentType === 'subzi') updatedSlot.subzi_id = componentId
    else if (componentType === 'extras') {
      // For extras swap, componentId is added to the array (replacing is handled by MealPickerSheet)
      updatedSlot.extra_ids = [componentId]
    }
    updatedSlots[slotIndex] = updatedSlot
    const newPlan = { slots: updatedSlots }
    set({ plan: newPlan })
    saveWeekPlan(currentWeekStart, newPlan, locks)
  },

  regenerate: async () => {
    const { locks, plan, currentWeekStart } = get()
    if (!plan) return
    set({ isGenerating: true, warningBannerDismissed: false })
    try {
      // Build locked slot constraints from current locks + plan
      const lockedSlots: GenerateOptions['lockedSlots'] = {}
      for (const planSlot of plan.slots) {
        const daySlotKey = `${planSlot.day}-${planSlot.meal_slot}` as `${DayOfWeek}-${MealSlot}`
        const constraint: Record<string, number | number[] | undefined> = {}
        let hasLock = false
        if (locks[`${planSlot.day}-${planSlot.meal_slot}-base`]) {
          constraint.base_id = planSlot.base_id; hasLock = true
        }
        if (locks[`${planSlot.day}-${planSlot.meal_slot}-curry`] && planSlot.curry_id !== undefined) {
          constraint.curry_id = planSlot.curry_id; hasLock = true
        }
        if (locks[`${planSlot.day}-${planSlot.meal_slot}-subzi`] && planSlot.subzi_id !== undefined) {
          constraint.subzi_id = planSlot.subzi_id; hasLock = true
        }
        if (locks[`${planSlot.day}-${planSlot.meal_slot}-extras`]) {
          constraint.extra_ids = planSlot.extra_ids; hasLock = true
        }
        if (hasLock) {
          lockedSlots[daySlotKey] = constraint as typeof lockedSlots[typeof daySlotKey]
        }
      }
      const result = await generate({ lockedSlots })
      set({ plan: result.plan, warnings: result.warnings, isGenerating: false })
      saveWeekPlan(currentWeekStart, result.plan, locks)
    } catch {
      set({ isGenerating: false })
    }
  },

  generateFresh: async () => {
    const currentWeekStart = get().currentWeekStart
    set({ isGenerating: true, warningBannerDismissed: false })
    try {
      const result = await generate()
      const { locks } = get()
      set({ plan: result.plan, warnings: result.warnings, isGenerating: false })
      saveWeekPlan(currentWeekStart, result.plan, locks)
    } catch {
      set({ isGenerating: false })
    }
  },

  dismissWarningBanner: () => set({ warningBannerDismissed: true }),

  navigateToWeek: async (weekStart: string) => {
    const thisWeek = getISOWeekStart(new Date())
    const isReadOnly = weekStart < thisWeek

    if (weekStart === thisWeek) {
      // Load from active_plan for fast current-week hydration (D-09)
      const record = await getActivePlan()
      set({
        plan: record?.plan ?? null,
        locks: record?.locks ?? {},
        currentWeekStart: weekStart,
        isReadOnly: false,
        warnings: [],
        warningBannerDismissed: false,
      })
    } else {
      // Load from saved_plans for past/future weeks
      const saved = await getWeekPlan(weekStart)
      set({
        plan: saved?.slots ?? null,
        locks: saved?.locks ?? {},
        currentWeekStart: weekStart,
        isReadOnly,
        warnings: [],
        warningBannerDismissed: false,
      })
    }
  },
  exportPlan: async (componentNames) => {
    const { plan, currentWeekStart } = get()
    if (!plan) return
    set({ isExporting: true, exportError: null })
    try {
      const weekLabel = `Week of ${formatWeekLabel(currentWeekStart)}`

      // Build serialized slots with resolved component names
      const slots = plan.slots.map(s => {
        const parts: string[] = []
        const baseName = componentNames[s.base_id]
        if (baseName) parts.push(baseName)
        if (s.curry_id !== undefined) {
          const curryName = componentNames[s.curry_id]
          if (curryName) parts.push(curryName)
        }
        if (s.subzi_id !== undefined) {
          const subziName = componentNames[s.subzi_id]
          if (subziName) parts.push(subziName)
        }
        for (const eid of s.extra_ids) {
          const extraName = componentNames[eid]
          if (extraName) parts.push(extraName)
        }
        return {
          day: s.day,
          meal_slot: s.meal_slot,
          text: parts.length > 0 ? parts.join(', ') : '—',
        }
      })

      const payload: ExportPlanPayload = { slots, weekLabel }

      const response = await fetch('/api/export-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()

      const weekSlug = currentWeekStart
      const filename = `meal-plan-${weekSlug}.png`

      // Try Web Share API on mobile first
      const file = new File([blob], filename, { type: 'image/png' })
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Meal Plan' })
      } else {
        // Desktop / fallback: trigger download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
      set({ isExporting: false })
    } catch {
      set({ isExporting: false, exportError: 'Export failed. Try again.' })
    }
  },
}))

// Re-export addWeeks for use in WeekNavigator (imported from week-utils directly is fine too)
export { addWeeks }

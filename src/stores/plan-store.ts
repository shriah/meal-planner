'use client'
import { create } from 'zustand'
import type { WeeklyPlan, Warning, DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'
import { getActivePlan, saveActivePlan } from '@/services/plan-db'
import { generate } from '@/services/generator'
import type { GenerateOptions } from '@/services/generator'

type LockableComponent = 'base' | 'curry' | 'subzi' | 'extras'
export type LockKey = `${DayOfWeek}-${MealSlot}-${LockableComponent}`

interface PlanStore {
  plan: WeeklyPlan | null
  locks: Record<string, boolean>
  warnings: Warning[]
  isGenerating: boolean
  hydrated: boolean
  warningBannerDismissed: boolean

  initFromDB: () => Promise<void>
  setLock: (key: LockKey, locked: boolean) => void
  lockDay: (day: DayOfWeek) => void
  unlockDay: (day: DayOfWeek) => void
  swapComponent: (day: DayOfWeek, slot: MealSlot, componentType: LockableComponent, componentId: number) => void
  regenerate: () => Promise<void>
  generateFresh: () => Promise<void>
  dismissWarningBanner: () => void
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

  initFromDB: async () => {
    const record = await getActivePlan()
    set({
      plan: record?.plan ?? null,
      locks: record?.locks ?? {},
      hydrated: true,
    })
  },

  setLock: (key, locked) => {
    const newLocks = { ...get().locks, [key]: locked }
    set({ locks: newLocks })
    const { plan } = get()
    if (plan) saveActivePlan({ plan, locks: newLocks })
  },

  lockDay: (day) => {
    const newLocks = { ...get().locks }
    for (const slot of ALL_SLOTS) {
      for (const comp of ALL_LOCKABLE) {
        newLocks[`${day}-${slot}-${comp}`] = true
      }
    }
    set({ locks: newLocks })
    const { plan } = get()
    if (plan) saveActivePlan({ plan, locks: newLocks })
  },

  unlockDay: (day) => {
    const newLocks = { ...get().locks }
    for (const slot of ALL_SLOTS) {
      for (const comp of ALL_LOCKABLE) {
        newLocks[`${day}-${slot}-${comp}`] = false
      }
    }
    set({ locks: newLocks })
    const { plan } = get()
    if (plan) saveActivePlan({ plan, locks: newLocks })
  },

  swapComponent: (day, slot, componentType, componentId) => {
    const { plan, locks } = get()
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
    saveActivePlan({ plan: newPlan, locks })
  },

  regenerate: async () => {
    const { locks, plan } = get()
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
      await saveActivePlan({ plan: result.plan, locks })
    } catch {
      set({ isGenerating: false })
    }
  },

  generateFresh: async () => {
    set({ isGenerating: true, warningBannerDismissed: false })
    try {
      const result = await generate()
      const { locks } = get()
      set({ plan: result.plan, warnings: result.warnings, isGenerating: false })
      await saveActivePlan({ plan: result.plan, locks })
    } catch {
      set({ isGenerating: false })
    }
  },

  dismissWarningBanner: () => set({ warningBannerDismissed: true }),
}))

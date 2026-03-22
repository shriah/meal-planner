/** @jsxImportSource satori/jsx */
import type { DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'

// Slot color palette from UI-SPEC
const SLOT_COLORS: Record<MealSlot, { bg: string; text: string }> = {
  breakfast: { bg: '#fef9c3', text: '#78350f' },
  lunch:     { bg: '#dcfce7', text: '#14532d' },
  dinner:    { bg: '#dbeafe', text: '#1e3a5f' },
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

interface SerializedSlot {
  day: DayOfWeek
  meal_slot: MealSlot
  text: string   // Pre-resolved: "Idli, Sambar" or "—"
}

export interface ExportPlanPayload {
  slots: SerializedSlot[]
  weekLabel: string   // "Week of Mar 17–23, 2026"
}

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function buildPlanElement(payload: ExportPlanPayload) {
  const { slots, weekLabel } = payload

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 390,
        backgroundColor: '#ffffff',
        fontFamily: 'Inter',
        padding: 24,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 16,
          borderBottom: '2px solid #e5e5e5',
          paddingBottom: 12,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a0a' }}>Food Planner</div>
        <div style={{ fontSize: 14, color: '#6b6b55' }}>{weekLabel}</div>
      </div>

      {/* Day rows */}
      {DAYS.map(day => (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a0a', marginBottom: 4 }}>
            {DAY_LABELS[day]}
          </div>
          {ALL_SLOTS.map(slot => {
            const found = slots.find(s => s.day === day && s.meal_slot === slot)
            const text = found?.text || '—'
            const colors = SLOT_COLORS[slot]
            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: colors.bg,
                  borderRadius: 6,
                  padding: '6px 10px',
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.text, marginBottom: 2 }}>
                  {SLOT_LABELS[slot].toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: colors.text }}>
                  {text}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

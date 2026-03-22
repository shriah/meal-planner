import type { DayOfWeek } from '@/types/plan'
import type { MealSlot } from '@/types/preferences'

// Slot color palette from UI-SPEC
const SLOT_COLORS: Record<MealSlot, { bg: string; text: string }> = {
  breakfast: { bg: '#fef9c3', text: '#78350f' },
  lunch:    { bg: '#dcfce7', text: '#14532d' },
  dinner:   { bg: '#dbeafe', text: '#1e3a5f' },
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

export function buildPlanElement(payload: ExportPlanPayload) {
  const { slots, weekLabel } = payload
  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  const dayRows = days.map(day => {
    const slotRows = ALL_SLOTS.map(slot => {
      const found = slots.find(s => s.day === day && s.meal_slot === slot)
      const text = found?.text || '—'
      const colors = SLOT_COLORS[slot]
      return {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            backgroundColor: colors.bg,
            borderRadius: 6,
            padding: '6px 10px',
            marginBottom: 4,
          },
          children: [
            {
              type: 'span',
              props: {
                style: { fontSize: 13, color: colors.text, fontWeight: 400 },
                children: `${SLOT_LABELS[slot]}: `,
              },
            },
            {
              type: 'span',
              props: {
                style: { fontSize: 14, color: colors.text },
                children: text,
              },
            },
          ],
        },
      }
    })

    return {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', marginBottom: 12 },
        children: [
          {
            type: 'div',
            props: {
              style: { fontSize: 16, fontWeight: 600, color: '#1a1a0a', marginBottom: 4 },
              children: DAY_LABELS[day],
            },
          },
          ...slotRows,
        ],
      },
    }
  })

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: 390,
        backgroundColor: '#ffffff',
        fontFamily: 'Inter',
        padding: 24,
      },
      children: [
        // Header
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              marginBottom: 16,
              borderBottom: '2px solid #e5e5e5',
              paddingBottom: 12,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: 20, fontWeight: 600, color: '#1a1a0a' },
                  children: 'Food Planner',
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 14, color: '#6b6b55' },
                  children: weekLabel,
                },
              },
            ],
          },
        },
        // Day rows
        ...dayRows,
      ],
    },
  }
}

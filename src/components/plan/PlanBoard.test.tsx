// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PlanBoard } from './PlanBoard'
import type { ComponentRecord } from '@/types/component'
import type { WeeklyPlan } from '@/types/plan'
import type { PlanProblem } from '@/services/plan-generation'
import type { RuleIssue } from '@/rules'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Build a full 21-slot plan for testing
function buildFullPlan(): WeeklyPlan {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const slots = ['breakfast', 'lunch', 'dinner'] as const
  return {
    slots: days.flatMap(day =>
      slots.map(meal_slot => ({
        day,
        meal_slot,
        base_id: 1,
        curry_id: 2,
        subzi_id: 3,
        extra_ids: [],
      }))
    ),
  }
}

// Control state via these variables
let mockPlan: WeeklyPlan | null = null
let mockAllComponents: ComponentRecord[] = []
let mockProblems: PlanProblem[] = []
let mockRuleIssues: RuleIssue[] = []
const mockInitFromDB = vi.fn()
const mockGenerateFresh = vi.fn()
const mockRegenerate = vi.fn()
const mockMealPickerSheet = vi.fn<(props: unknown) => null>(() => null)

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      plan: mockPlan,
      problems: mockProblems,
      ruleIssues: mockRuleIssues,
      hydrated: true,
      isGenerating: false,
      isReadOnly: false,
      currentWeekStart: '2026-03-23',
      problemsDismissed: false,
      locks: {},
      initFromDB: mockInitFromDB,
      generateFresh: mockGenerateFresh,
      regenerate: mockRegenerate,
      setLock: vi.fn(),
      lockDay: vi.fn(),
      unlockDay: vi.fn(),
      dismissProblems: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => mockAllComponents),
}))

vi.mock('./MealPickerSheet', () => ({
  MealPickerSheet: (props: unknown) => {
    mockMealPickerSheet(props)
    return null
  },
}))

describe('PlanBoard', () => {
  beforeEach(() => {
    mockPlan = null
    mockAllComponents = []
    mockProblems = []
    mockRuleIssues = []
    mockInitFromDB.mockClear()
    mockGenerateFresh.mockClear()
    mockMealPickerSheet.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty state with "No plan yet" when plan is null', () => {
    mockPlan = null
    render(<PlanBoard />)
    expect(screen.getByText('No plan yet')).toBeTruthy()
    // "Generate Plan" appears in both the PlanActionBar and the empty state CTA
    const generateBtns = screen.getAllByText('Generate Plan')
    expect(generateBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('renders 7 day column headers when plan exists', () => {
    mockPlan = buildFullPlan()
    render(<PlanBoard />)
    // Each day abbreviation appears once in the header
    expect(screen.getAllByText('Mon').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Tue').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Wed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Thu').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Fri').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sat').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sun').length).toBeGreaterThanOrEqual(1)
  })

  it('renders 3 meal slot row labels', () => {
    mockPlan = buildFullPlan()
    render(<PlanBoard />)
    // Slot labels appear as row labels in the grid
    expect(screen.getAllByText('Breakfast').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Lunch').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Dinner').length).toBeGreaterThanOrEqual(1)
  })

  it('renders 21 MealCell components for a full plan', () => {
    mockPlan = buildFullPlan()
    render(<PlanBoard />)
    // Verify the grid renders: 7 day headers + 3 slot labels = a full grid
    expect(screen.getAllByText('Mon').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Breakfast').length).toBeGreaterThanOrEqual(1)
    // Lock buttons: 21 cells × 4 components = 84
    const lockButtons = screen.getAllByRole('button', { name: /^Lock (Base|Curry|Subzi|Extras)$/ })
    expect(lockButtons.length).toBe(84)
  })

  it('opens MealPickerSheet on the clicked slot for extras', () => {
    mockPlan = {
      slots: [
        {
          day: 'monday',
          meal_slot: 'lunch',
          base_id: 101,
          curry_id: 102,
          subzi_id: 103,
          extra_ids: [104],
        },
      ],
    }
    mockAllComponents = [
      {
        id: 101,
        name: 'Plain Rice',
        componentType: 'base',
        base_type: 'rice-based',
        base_category_id: 42,
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 102,
        name: 'Dal',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 103,
        name: 'Beans',
        componentType: 'subzi',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 104,
        name: 'Pickle',
        componentType: 'extra',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]

    render(<PlanBoard />)
    fireEvent.click(screen.getByText('Pickle'))

    expect(mockMealPickerSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        componentType: 'extras',
        day: 'monday',
        slot: 'lunch',
      }),
    )
  })

  it('opens MealPickerSheet on the clicked slot for curries', () => {
    mockPlan = {
      slots: [
        {
          day: 'monday',
          meal_slot: 'lunch',
          base_id: 101,
          curry_id: 102,
          subzi_id: 103,
          extra_ids: [104],
        },
      ],
    }
    mockAllComponents = [
      {
        id: 101,
        name: 'Plain Rice',
        componentType: 'base',
        base_type: 'rice-based',
        base_category_id: 42,
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 102,
        name: 'Dal',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 103,
        name: 'Beans',
        componentType: 'subzi',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 104,
        name: 'Pickle',
        componentType: 'extra',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]

    render(<PlanBoard />)
    fireEvent.click(screen.getByText('Dal'))

    expect(mockMealPickerSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        componentType: 'curry',
        day: 'monday',
        slot: 'lunch',
      }),
    )
  })

  it('opens MealPickerSheet on the clicked slot for bases', () => {
    mockPlan = {
      slots: [
        {
          day: 'monday',
          meal_slot: 'lunch',
          base_id: 101,
          curry_id: 102,
          subzi_id: 103,
          extra_ids: [104],
        },
      ],
    }
    mockAllComponents = [
      {
        id: 101,
        name: 'Plain Rice',
        componentType: 'base',
        base_type: 'rice-based',
        base_category_id: 42,
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 102,
        name: 'Dal',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 103,
        name: 'Beans',
        componentType: 'subzi',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 104,
        name: 'Pickle',
        componentType: 'extra',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]

    render(<PlanBoard />)
    fireEvent.click(screen.getByText('Plain Rice'))

    expect(mockMealPickerSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        componentType: 'base',
        day: 'monday',
        slot: 'lunch',
      }),
    )
  })

  it('opens MealPickerSheet on the clicked slot for subzis', () => {
    mockPlan = {
      slots: [
        {
          day: 'monday',
          meal_slot: 'lunch',
          base_id: 101,
          curry_id: 102,
          subzi_id: 103,
          extra_ids: [104],
        },
      ],
    }
    mockAllComponents = [
      {
        id: 101,
        name: 'Plain Rice',
        componentType: 'base',
        base_type: 'rice-based',
        base_category_id: 42,
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 102,
        name: 'Dal',
        componentType: 'curry',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 103,
        name: 'Beans',
        componentType: 'subzi',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 104,
        name: 'Pickle',
        componentType: 'extra',
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]

    render(<PlanBoard />)
    fireEvent.click(screen.getByText('Beans'))

    expect(mockMealPickerSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        componentType: 'subzi',
        day: 'monday',
        slot: 'lunch',
      }),
    )
  })

  it('explains broken rules in the banner and highlights the meal they are in', () => {
    mockPlan = { slots: [{ day: 'monday', meal_slot: 'lunch', base_id: 101, extra_ids: [] }] }
    mockAllComponents = [
      {
        id: 101,
        name: 'Plain Rice',
        componentType: 'base',
        base_type: 'rice-based',
        base_category_id: 42,
        dietary_tags: ['veg'],
        regional_tags: ['pan-indian'],
        occasion_tags: [],
        created_at: '2026-03-28T00:00:00.000Z',
      },
    ]
    mockProblems = [
      { level: 'hard', reason: 'Always include dishes with fish', message: 'Always include dishes with fish — Monday lunch', ruleId: 3, day: 'monday', meal: 'lunch' },
      { level: 'soft', reason: 'Vary dishes across the week', message: 'Vary dishes across the week — this week' },
    ]
    mockRuleIssues = [{ ruleId: 9, name: 'Old category rule', message: 'refers to base category #4, which no longer exists' }]

    render(<PlanBoard />)

    expect(screen.getByText('1 rule could not be met — see highlighted meals; 1 rule was skipped')).toBeTruthy()
    expect(screen.getAllByText('Always include dishes with fish — Monday lunch').length).toBeGreaterThan(0)
    // A problem from a stored rule links to that rule; one without a rule does not.
    expect(screen.getByRole('link', { name: 'Open rule' }).getAttribute('href')).toBe('/rules#rule-3')
    expect(screen.getByText('Skipped “Old category rule”: refers to base category #4, which no longer exists')).toBeTruthy()
    // Unmet preferences are not presented as problems.
    expect(screen.queryByText(/Vary dishes/)).toBeNull()
    // The reason is readable without hovering: it opens inline in the meal.
    const toggle = screen.getByRole('button', { name: /Rule broken/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Always include dishes with fish')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Always include dishes with fish')).toBeTruthy()
    expect(screen.getByText('Plain Rice')).toBeTruthy()
  })
})

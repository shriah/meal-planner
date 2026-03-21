// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PlanBoard } from './PlanBoard'
import type { WeeklyPlan } from '@/types/plan'

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
const mockInitFromDB = vi.fn()
const mockGenerateFresh = vi.fn()
const mockRegenerate = vi.fn()

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      plan: mockPlan,
      warnings: [],
      hydrated: true,
      isGenerating: false,
      warningBannerDismissed: false,
      locks: {},
      initFromDB: mockInitFromDB,
      generateFresh: mockGenerateFresh,
      regenerate: mockRegenerate,
      setLock: vi.fn(),
      lockDay: vi.fn(),
      unlockDay: vi.fn(),
      dismissWarningBanner: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => []),
}))

describe('PlanBoard', () => {
  beforeEach(() => {
    mockPlan = null
    mockInitFromDB.mockClear()
    mockGenerateFresh.mockClear()
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
})

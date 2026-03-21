import { describe, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the store - will be filled in after PlanBoard is implemented
vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      plan: null,
      warnings: [],
      hydrated: true,
      isGenerating: false,
      initFromDB: vi.fn(),
      generateFresh: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => []),
}))

describe('PlanBoard', () => {
  it.todo('renders empty state with "No plan yet" when plan is null')
  it.todo('renders 7 day column headers when plan exists')
  it.todo('renders 3 meal slot row labels')
  it.todo('renders 21 MealCell components for a full plan')
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mockSwapComponent = vi.fn()

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      swapComponent: mockSwapComponent,
    }
    return selector(state)
  }),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => [
    {
      id: 1,
      name: 'Chicken Curry',
      componentType: 'curry',
      dietary_tags: ['non-veg'],
      regional_tags: ['north-indian'],
      occasion_tags: ['everyday'],
      created_at: '2026-01-01',
    },
    {
      id: 2,
      name: 'Dal Makhani',
      componentType: 'curry',
      dietary_tags: ['veg'],
      regional_tags: ['north-indian'],
      occasion_tags: ['everyday'],
      created_at: '2026-01-01',
    },
  ]),
}))

vi.mock('@/lib/filter-components', () => ({
  filterComponents: vi.fn((...args) => args[0]),  // pass-through
}))

// Import after mocks are set up
const { MealPickerSheet } = await import('./MealPickerSheet')

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  day: 'monday' as const,
  slot: 'lunch' as const,
  componentType: 'curry' as const,
}

describe('MealPickerSheet', () => {
  beforeEach(() => {
    mockSwapComponent.mockClear()
    defaultProps.onOpenChange = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders correct title based on componentType ('Pick Curry' for curry)", () => {
    render(<MealPickerSheet {...defaultProps} componentType="curry" />)
    expect(screen.getByText('Pick Curry')).toBeTruthy()
  })

  it('renders correct title for other component types', () => {
    const { unmount } = render(<MealPickerSheet {...defaultProps} componentType="base" />)
    expect(screen.getByText('Pick Base')).toBeTruthy()
    unmount()

    render(<MealPickerSheet {...defaultProps} componentType="subzi" />)
    expect(screen.getByText('Pick Subzi')).toBeTruthy()
  })

  it('renders search input for filtering components', () => {
    render(<MealPickerSheet {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    expect(input).toBeTruthy()
  })

  it('renders dietary and regional tag filter chips', () => {
    render(<MealPickerSheet {...defaultProps} />)
    // Dietary tags (getAllByText used since tags can repeat in component rows too)
    expect(screen.getAllByText('veg').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('non-veg').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('vegan').length).toBeGreaterThanOrEqual(1)
    // Regional tags
    expect(screen.getAllByText('south-indian').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('north-indian').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('coastal-konkan').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('pan-indian').length).toBeGreaterThanOrEqual(1)
  })

  it('calls swapComponent and closes sheet on component selection', () => {
    const onOpenChange = vi.fn()
    render(<MealPickerSheet {...defaultProps} onOpenChange={onOpenChange} />)
    // Click the first component in the list
    const chickenCurry = screen.getByText('Chicken Curry')
    fireEvent.click(chickenCurry)
    expect(mockSwapComponent).toHaveBeenCalledWith('monday', 'lunch', 'curry', 1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("renders 'No currys match your filters' when filtered list is empty", async () => {
    const { filterComponents } = await import('@/lib/filter-components')
    vi.mocked(filterComponents).mockReturnValueOnce([])
    render(<MealPickerSheet {...defaultProps} />)
    expect(screen.getByText(/no currys match your filters/i)).toBeTruthy()
  })
})

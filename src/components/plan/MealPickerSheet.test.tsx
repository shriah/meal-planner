// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MealPickerSheet } from './MealPickerSheet'

const mockSwapComponent = vi.fn()
const mockGetComponentsByType = vi.fn()
const mockFilterComponents = vi.fn((...args: unknown[]) => args[0])
const mockSlotConflicts = vi.fn<(...args: unknown[]) => Map<number, { level: string; message: string }[]>>(() => new Map())
const plan = { slots: [] }
const planningInput = { library: [], categories: [], rules: [] }

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => selector({ swapComponent: mockSwapComponent, plan })),
}))

vi.mock('@/services/planning', () => ({
  loadPlanningInput: () => planningInput,
}))

vi.mock('@/services/plan-generation', () => ({
  slotConflicts: (...args: unknown[]) => mockSlotConflicts(...args),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((query) => query()),
}))

vi.mock('@/services/food-db', () => ({
  getComponentsByType: (...args: unknown[]) => mockGetComponentsByType(...args),
}))

vi.mock('@/lib/filter-components', () => ({
  filterComponents: (...args: unknown[]) => mockFilterComponents(...args),
}))

const curryComponents = [
  {
    id: 1,
    name: 'Chicken Curry',
    componentType: 'curry',
    dietary_tags: ['non-veg'],
    regional_tags: ['north-indian'],
    occasion_tags: [],
    created_at: '2026-01-01',
  },
  {
    id: 2,
    name: 'Dal Makhani',
    componentType: 'curry',
    dietary_tags: ['veg'],
    regional_tags: ['north-indian'],
    occasion_tags: [],
    created_at: '2026-01-01',
  },
  {
    id: 3,
    name: 'Legacy Curry',
    componentType: 'curry',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: [],
    created_at: '2026-01-01',
  },
]

const extraComponents = [
  {
    id: 11,
    name: 'Pickle',
    componentType: 'extra',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: [],
    created_at: '2026-01-01',
  },
]

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
    mockGetComponentsByType.mockReset()
    mockFilterComponents.mockClear()
    mockSlotConflicts.mockReset()
    mockSlotConflicts.mockImplementation(() => new Map())
    defaultProps.onOpenChange = vi.fn()

    mockGetComponentsByType.mockImplementation((type: string) => {
      if (type === 'curry') return curryComponents
      if (type === 'extra') return extraComponents
      return []
    })
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
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy()
  })

  it('renders dietary and regional tag filter chips', () => {
    render(<MealPickerSheet {...defaultProps} />)
    expect(screen.getAllByText('veg').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('non-veg').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('vegan').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('south-indian').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('north-indian').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('coastal-konkan').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('pan-indian').length).toBeGreaterThanOrEqual(1)
  })

  it('calls swapComponent and closes sheet on component selection', () => {
    const onOpenChange = vi.fn()
    render(<MealPickerSheet {...defaultProps} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText('Chicken Curry'))
    expect(mockSwapComponent).toHaveBeenCalledWith('monday', 'lunch', 'curry', 1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('loads extras through the flat extra query path', () => {
    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="extras"
      />,
    )

    expect(mockGetComponentsByType).toHaveBeenCalledWith('extra')
    expect(screen.getByText('Pickle')).toBeTruthy()
  })

  it('still loads extras when no base category is available', () => {
    render(<MealPickerSheet {...defaultProps} componentType="extras" />)
    expect(mockGetComponentsByType).toHaveBeenCalledWith('extra')
    expect(screen.getByText('Pickle')).toBeTruthy()
  })

  it('asks the planner which choices break a rule in this slot of the current plan', () => {
    render(<MealPickerSheet {...defaultProps} componentType="curry" />)

    expect(mockSlotConflicts).toHaveBeenCalledWith(planningInput, plan, 'monday', 'lunch', 'curry', [1, 2, 3])
  })

  it('groups choices that fit the rules apart from overrides, showing what each override breaks', () => {
    mockSlotConflicts.mockImplementation(() => new Map([[1, [{ level: 'hard', message: 'Chicken Curry: base pairing' }]]]))

    render(<MealPickerSheet {...defaultProps} componentType="curry" />)

    expect(screen.getByText('Fits your rules')).toBeTruthy()
    expect(screen.getByText('Breaks a rule')).toBeTruthy()
    expect(screen.getByText('Dal Makhani')).toBeTruthy()
    expect(screen.getByText('Chicken Curry: base pairing')).toBeTruthy()

    fireEvent.click(screen.getByText('Chicken Curry'))

    expect(mockSwapComponent).toHaveBeenCalledWith('monday', 'lunch', 'curry', 1)
  })

  it('collapses to one flat list when every choice breaks a rule', () => {
    mockSlotConflicts.mockImplementation(() => new Map([1, 2, 3].map((id) => [id, [{ level: 'hard', message: 'x' }]])))

    render(<MealPickerSheet {...defaultProps} componentType="curry" />)

    expect(screen.queryByText('Fits your rules')).toBeNull()
    expect(screen.queryByText('Breaks a rule')).toBeNull()
    expect(screen.getByText('Chicken Curry')).toBeTruthy()
    expect(screen.getByText('Dal Makhani')).toBeTruthy()
  })

  it('keeps base and extras picker flows as flat lists', () => {
    mockGetComponentsByType.mockImplementation((type: string) => {
      if (type === 'base') {
        return [{
          id: 21,
          name: 'Chapati',
          componentType: 'base',
          dietary_tags: ['veg'],
          regional_tags: ['north-indian'],
          occasion_tags: [],
          created_at: '2026-01-01',
        }]
      }

      if (type === 'extra') {
        return extraComponents
      }

      return curryComponents
    })

    const { unmount } = render(<MealPickerSheet {...defaultProps} componentType="base" />)

    expect(screen.getByText('Chapati')).toBeTruthy()
    expect(screen.queryByText('Fits your rules')).toBeNull()
    expect(screen.queryByText('Breaks a rule')).toBeNull()

    unmount()

    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="extras"
      />,
    )

    expect(screen.getByText('Pickle')).toBeTruthy()
    expect(screen.queryByText('Fits your rules')).toBeNull()
    expect(screen.queryByText('Breaks a rule')).toBeNull()
  })
})

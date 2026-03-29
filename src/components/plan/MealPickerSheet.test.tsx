// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MealPickerSheet } from './MealPickerSheet'

const mockSwapComponent = vi.fn()
const mockGetComponentsByType = vi.fn()
const mockGetExtrasByBaseCategoryId = vi.fn()
const mockFilterComponents = vi.fn((components) => components)

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => selector({ swapComponent: mockSwapComponent })),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((query) => query()),
}))

vi.mock('@/services/food-db', () => ({
  getComponentsByType: (...args: unknown[]) => mockGetComponentsByType(...args),
  getExtrasByBaseCategoryId: (...args: unknown[]) => mockGetExtrasByBaseCategoryId(...args),
}))

vi.mock('@/lib/filter-components', () => ({
  filterComponents: (...args: unknown[]) => mockFilterComponents(...args),
}))

const curryComponents = [
  {
    id: 1,
    name: 'Chicken Curry',
    componentType: 'curry',
    compatible_base_category_ids: [20],
    dietary_tags: ['non-veg'],
    regional_tags: ['north-indian'],
    occasion_tags: ['everyday'],
    created_at: '2026-01-01',
  },
  {
    id: 2,
    name: 'Dal Makhani',
    componentType: 'curry',
    compatible_base_category_ids: [10],
    dietary_tags: ['veg'],
    regional_tags: ['north-indian'],
    occasion_tags: ['everyday'],
    created_at: '2026-01-01',
  },
  {
    id: 3,
    name: 'Legacy Curry',
    componentType: 'curry',
    dietary_tags: ['veg'],
    regional_tags: ['pan-indian'],
    occasion_tags: ['everyday'],
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
    occasion_tags: ['everyday'],
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
    mockGetExtrasByBaseCategoryId.mockReset()
    mockFilterComponents.mockClear()
    defaultProps.onOpenChange = vi.fn()

    mockGetComponentsByType.mockImplementation((type: string) => {
      if (type === 'curry') return curryComponents
      return []
    })
    mockGetExtrasByBaseCategoryId.mockReturnValue(extraComponents)
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

  it('filters extras through the category-aware query path', () => {
    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="extras"
        currentBaseCategoryId={42}
      />,
    )

    expect(mockGetExtrasByBaseCategoryId).toHaveBeenCalledWith(42)
    expect(mockGetComponentsByType).not.toHaveBeenCalledWith('extra')
    expect(screen.getByText('Pickle')).toBeTruthy()
  })

  it("renders 'No extras match your filters' when no base category is available", () => {
    render(<MealPickerSheet {...defaultProps} componentType="extras" />)
    expect(mockGetExtrasByBaseCategoryId).not.toHaveBeenCalled()
    expect(screen.getByText(/no extras match your filters/i)).toBeTruthy()
  })

  it('groups compatible and explicit override curries when both sets exist', () => {
    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="curry"
        currentBaseCategoryId={10}
      />,
    )

    expect(screen.getByText('Compatible Curries')).toBeTruthy()
    expect(screen.getByText('Override Choices')).toBeTruthy()
    expect(screen.getByText('Dal Makhani')).toBeTruthy()
    expect(screen.getByText('Chicken Curry')).toBeTruthy()

    fireEvent.click(screen.getByText('Chicken Curry'))

    expect(mockSwapComponent).toHaveBeenCalledWith('monday', 'lunch', 'curry', 1)
  })

  it('collapses to one flat curry list when the base has no compatible curries', () => {
    mockFilterComponents.mockReturnValueOnce(curryComponents.slice(0, 2))

    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="curry"
        currentBaseCategoryId={99}
      />,
    )

    expect(screen.queryByText('Compatible Curries')).toBeNull()
    expect(screen.queryByText('Override Choices')).toBeNull()
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
          occasion_tags: ['everyday'],
          created_at: '2026-01-01',
        }]
      }

      return curryComponents
    })

    const { unmount } = render(<MealPickerSheet {...defaultProps} componentType="base" />)

    expect(screen.getByText('Chapati')).toBeTruthy()
    expect(screen.queryByText('Compatible Curries')).toBeNull()
    expect(screen.queryByText('Override Choices')).toBeNull()

    unmount()

    render(
      <MealPickerSheet
        {...defaultProps}
        componentType="extras"
        currentBaseCategoryId={42}
      />,
    )

    expect(screen.getByText('Pickle')).toBeTruthy()
    expect(screen.queryByText('Compatible Curries')).toBeNull()
    expect(screen.queryByText('Override Choices')).toBeNull()
  })
})

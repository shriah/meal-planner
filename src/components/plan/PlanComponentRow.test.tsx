// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PlanComponentRow } from './PlanComponentRow'

// Mock usePlanStore - returns selected value from mock state
const mockSetLock = vi.fn()
let mockLocks: Record<string, boolean> = {}

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      locks: mockLocks,
      setLock: mockSetLock,
    }
    return selector(state)
  }),
}))

describe('PlanComponentRow', () => {
  beforeEach(() => {
    mockLocks = {}
    mockSetLock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders unlock icon when component is not locked', () => {
    mockLocks = {}
    render(
      <PlanComponentRow
        day="monday"
        slot="lunch"
        componentType="base"
        displayName="Rice"
        onPickerOpen={vi.fn()}
      />
    )
    const lockBtn = screen.getByRole('button', { name: /lock base/i })
    expect(lockBtn).toBeTruthy()
  })

  it('renders lock icon when component is locked', () => {
    mockLocks = { 'monday-lunch-base': true }
    render(
      <PlanComponentRow
        day="monday"
        slot="lunch"
        componentType="base"
        displayName="Rice"
        onPickerOpen={vi.fn()}
      />
    )
    const unlockBtn = screen.getByRole('button', { name: /unlock base/i })
    expect(unlockBtn).toBeTruthy()
  })

  it('clicking lock icon calls setLock with correct key', () => {
    mockLocks = {}
    render(
      <PlanComponentRow
        day="tuesday"
        slot="dinner"
        componentType="curry"
        displayName="Dal"
        onPickerOpen={vi.fn()}
      />
    )
    const lockBtn = screen.getByRole('button', { name: /lock curry/i })
    fireEvent.click(lockBtn)
    expect(mockSetLock).toHaveBeenCalledWith('tuesday-dinner-curry', true)
  })

  it('does not trigger onPickerOpen when locked', () => {
    mockLocks = { 'monday-lunch-subzi': true }
    const onPickerOpen = vi.fn()
    render(
      <PlanComponentRow
        day="monday"
        slot="lunch"
        componentType="subzi"
        displayName="Aloo Gobi"
        onPickerOpen={onPickerOpen}
      />
    )
    // The component name span has no onClick when locked
    const nameEl = screen.getByText('Aloo Gobi')
    fireEvent.click(nameEl)
    expect(onPickerOpen).not.toHaveBeenCalled()
  })
})

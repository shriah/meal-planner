import { describe, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/stores/plan-store', () => ({
  usePlanStore: vi.fn((selector) => {
    const state = {
      locks: {},
      setLock: vi.fn(),
    }
    return selector(state)
  }),
}))

describe('PlanComponentRow', () => {
  it.todo('renders unlock icon when component is not locked')
  it.todo('renders lock icon when component is locked')
  it.todo('clicking lock icon calls setLock with correct key')
  it.todo('does not trigger onPickerOpen when locked')
})

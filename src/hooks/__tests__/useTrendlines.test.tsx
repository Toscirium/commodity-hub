import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTrendlines } from '../useTrendlines'
import type { UTCTimestamp } from 'lightweight-charts'

const p1 = { time: 1704067200 as UTCTimestamp, price: 100 }
const p2 = { time: 1704153600 as UTCTimestamp, price: 110 }

describe('useTrendlines', () => {
  it('adds a trendline scoped to the current commodity', () => {
    const { result } = renderHook(() => useTrendlines('Gold'))

    act(() => {
      result.current.addTrendline(p1, p2)
    })

    expect(result.current.trendlines).toHaveLength(1)
    expect(result.current.trendlines[0]).toMatchObject({ p1, p2 })
  })

  it('selects and removes a trendline', () => {
    const { result } = renderHook(() => useTrendlines('Gold'))

    let id = ''
    act(() => {
      id = result.current.addTrendline(p1, p2)
    })
    act(() => {
      result.current.setSelectedId(id)
    })
    expect(result.current.selectedId).toBe(id)

    act(() => {
      result.current.removeTrendline(id)
    })
    expect(result.current.trendlines).toHaveLength(0)
    expect(result.current.selectedId).toBeNull()
  })

  it('clears all trendlines', () => {
    const { result } = renderHook(() => useTrendlines('Gold'))

    act(() => {
      result.current.addTrendline(p1, p2)
      result.current.addTrendline(p2, p1)
    })
    expect(result.current.trendlines).toHaveLength(2)

    act(() => {
      result.current.clearTrendlines()
    })
    expect(result.current.trendlines).toHaveLength(0)
  })

  it('keeps trendlines scoped per commodity when switching symbols', () => {
    const { result, rerender } = renderHook(({ name }) => useTrendlines(name), {
      initialProps: { name: 'Gold' },
    })

    act(() => {
      result.current.addTrendline(p1, p2)
    })
    expect(result.current.trendlines).toHaveLength(1)

    rerender({ name: 'Silver' })
    expect(result.current.trendlines).toHaveLength(0)

    rerender({ name: 'Gold' })
    expect(result.current.trendlines).toHaveLength(1)
  })
})

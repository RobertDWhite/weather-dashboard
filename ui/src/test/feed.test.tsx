import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFeed } from '../hooks/useFeed'
import { get } from '../api'

describe('feed reliability', () => {
  it('does not turn a failed initial request into empty successful data', async () => {
    const { result } = renderHook(() =>
      useFeed('alerts', async () => {
        throw new Error('offline')
      }),
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeNull()
    expect(result.current.lastSuccess).toBeNull()
  })
  it('retains the last success time on failure and recovers on retry', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ temperature: 70 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ temperature: 72 })
    const { result } = renderHook(() => useFeed('current', loader))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const firstTime = result.current.lastSuccess
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('stale'))
    expect(result.current.lastSuccess).toBe(firstTime)
    expect(result.current.data).toEqual({ temperature: 70 })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.data).toEqual({ temperature: 72 }))
    expect(result.current.status).toBe('success')
  })
  it('discards an obsolete replay response after the requested timestamp changes', async () => {
    let resolveOld!: (data: string) => void
    const old = new Promise<string>((r) => {
      resolveOld = r
    })
    const { result, rerender } = renderHook(
      ({ key }) => useFeed(key, () => (key === 'old' ? old : Promise.resolve('new')), { interval: 0 }),
      { initialProps: { key: 'old' } },
    )
    rerender({ key: 'new' })
    await waitFor(() => expect(result.current.data).toBe('new'))
    await act(async () => resolveOld('old'))
    expect(result.current.data).toBe('new')
  })
  it('fetches optional feeds only while enabled and aborts on close', async () => {
    const loader = vi.fn(async (_s: AbortSignal) => [])
    const { rerender } = renderHook(({ enabled }) => useFeed('optional', loader, { enabled }), {
      initialProps: { enabled: false },
    })
    expect(loader).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const signal = loader.mock.calls[0][0]
    rerender({ enabled: false })
    expect(signal.aborted).toBe(true)
  })
  it('allows a fast feed to succeed while another is still pending', async () => {
    const { result } = renderHook(() => ({
      slow: useFeed('slow', () => new Promise(() => {})),
      fast: useFeed('fast', async () => 42),
    }))
    await waitFor(() => expect(result.current.fast.data).toBe(42))
    expect(result.current.slow.status).toBe('loading')
  })
  it('times out a hung network request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
          ),
      ),
    )
    const request = get('/hang').catch((e) => e)
    await vi.advanceTimersByTimeAsync(20_001)
    expect(((await request) as Error).name).toBe('AbortError')
  })
  it('marks aging data stale while a refresh is still pending', async () => {
    vi.useFakeTimers()
    const loader = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useFeed('aging', loader, { interval: 10_000, maxAge: 20_000 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.status).toBe('success')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(result.current.status).toBe('stale')
    expect(result.current.refreshing).toBe(true)
  })
  it('rejects upstream stale and error payloads even with HTTP 200', async () => {
    for (const body of [{ stale: true }, { source_error: 'offline' }, { error: 'offline' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
      await expect(get('/feed')).rejects.toThrow()
    }
  })
})

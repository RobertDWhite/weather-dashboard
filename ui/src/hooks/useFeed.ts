import { useCallback, useEffect, useRef, useState } from 'react'

export type FeedStatus = 'loading' | 'success' | 'stale' | 'error' | 'disabled'
export interface Feed<T> {
  data: T | null
  status: FeedStatus
  error: string | null
  lastSuccess: number | null
  refreshing: boolean
  retry: () => void
}

/** Independent requests never hold another feed's successful response hostage. */
export function useFeed<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  {
    interval = 60_000,
    enabled = true,
    maxAge = interval * 2.5,
  }: { interval?: number; enabled?: boolean; maxAge?: number } = {},
): Feed<T> {
  const load = useRef(loader)
  load.current = loader
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((n) => n + 1), [])
  const [state, setState] = useState<{
    key: string
    data: T | null
    error: string | null
    lastSuccess: number | null
    refreshing: boolean
  }>({ key, data: null, error: null, lastSuccess: null, refreshing: false })
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let pending = false
    let controller: AbortController | null = null
    const tick = async () => {
      if (pending) return
      pending = true
      controller = new AbortController()
      setState((s) => ({
        ...(s.key === key ? s : { key, data: null, error: null, lastSuccess: null }),
        refreshing: true,
      }))
      try {
        const data = await load.current(controller.signal)
        if (!disposed) setState({ key, data, error: null, lastSuccess: Date.now(), refreshing: false })
      } catch (e) {
        if (!disposed)
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e.message : 'Request failed',
            refreshing: false,
          }))
      } finally {
        pending = false
      }
    }
    void tick()
    const timer = interval > 0 ? setInterval(tick, interval) : undefined
    const clock = setInterval(() => setNow(Date.now()), 15_000)
    return () => {
      disposed = true
      controller?.abort()
      clearInterval(timer)
      clearInterval(clock)
    }
  }, [key, interval, enabled, revision])
  const current =
    state.key === key ? state : { data: null, error: null, lastSuccess: null, refreshing: enabled }
  const stale =
    current.data !== null &&
    (!!current.error || (current.lastSuccess !== null && now - current.lastSuccess > maxAge))
  return {
    ...current,
    retry,
    status: !enabled
      ? 'disabled'
      : stale
        ? 'stale'
        : current.error
          ? 'error'
          : current.data !== null
            ? 'success'
            : 'loading',
  }
}

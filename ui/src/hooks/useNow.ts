import { useEffect, useState } from 'react'

/** Returns Date.now() that ticks every `intervalMs` ms — useful for live
 * countdown timers that don't require per-component state. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Format `endsAtMs - nowMs` as e.g. "1h 23m" / "12m" / "expired". */
export function formatCountdown(endsAtMs: number, nowMs: number): string {
  const ms = endsAtMs - nowMs
  if (!isFinite(ms)) return ''
  if (ms <= 0) return 'expired'
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return '<1m'
}

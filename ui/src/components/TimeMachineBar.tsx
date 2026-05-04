/** Time-machine scrubber. Shows a compact timeline of the last N hours of
 * snapshots; when the user moves off "live", the parent fetches a snapshot at
 * that timestamp and renders alerts/LSRs in historical mode.
 */
import { useEffect, useMemo, useState } from 'react'
import type { TimeMachineSnapshotMeta } from '../types'
import { fetchTimeMachineList } from '../api'

interface Props {
  /** Currently-selected timestamp (epoch sec). null = live. */
  ts: number | null
  /** Called with epoch seconds when user scrubs; null when "Go live". */
  onChange: (ts: number | null) => void
  hours?: number
}

export default function TimeMachineBar({ ts, onChange, hours = 6 }: Props) {
  const [snaps, setSnaps] = useState<TimeMachineSnapshotMeta[]>([])
  const [ready, setReady] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const r = await fetchTimeMachineList(hours)
        if (!cancelled) {
          setSnaps(r.snapshots)
          setReady(r.ready)
        }
      } catch { /* tolerate */ }
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [hours])

  const peakTor = useMemo(() => Math.max(0, ...snaps.map((s) => s.tornado_count)), [snaps])
  const peakAlerts = useMemo(() => Math.max(0, ...snaps.map((s) => s.alert_count)), [snaps])

  if (!ready || snaps.length < 2) return null

  const minTs = snaps[0].ts
  const maxTs = snaps[snaps.length - 1].ts
  const cur = ts ?? maxTs

  const cell = (s: TimeMachineSnapshotMeta) => {
    const intensity = peakTor > 0
      ? s.tornado_count / peakTor
      : peakAlerts > 0 ? s.alert_count / peakAlerts : 0
    const color = s.tornado_count > 0
      ? '#ef4444'
      : s.alert_count > 0 ? '#f97316' : '#475569'
    const opacity = 0.25 + intensity * 0.75
    return { background: color, opacity, height: '100%', flex: 1 }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        ⏱ Time
      </span>

      <button
        onClick={() => onChange(null)}
        style={{
          background: ts === null ? '#22c55e' : 'var(--bg-card)',
          border: `1px solid ${ts === null ? '#22c55e' : 'var(--border)'}`,
          color: ts === null ? '#000' : 'var(--text-secondary)',
          padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
        }}
      >
        ● LIVE
      </button>

      {/* Heatmap-style bar */}
      <div style={{ flex: 1, display: 'flex', height: 18, gap: 1, position: 'relative' }}>
        {snaps.map((s) => (
          <div key={s.ts} style={cell(s)} title={`${new Date(s.ts * 1000).toLocaleTimeString()} · ${s.alert_count} alerts · ${s.tornado_count} tor`} />
        ))}
        {/* Cursor */}
        {ts !== null && (
          <div style={{
            position: 'absolute',
            left: `${((cur - minTs) / Math.max(1, maxTs - minTs)) * 100}%`,
            top: -3, bottom: -3,
            width: 2,
            background: '#22d3ee',
            boxShadow: '0 0 6px #22d3ee',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <input
        type="range"
        min={minTs}
        max={maxTs}
        step={Math.max(1, Math.floor((maxTs - minTs) / Math.max(snaps.length - 1, 1)))}
        value={cur}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v >= maxTs - 30) onChange(null)
          else onChange(v)
        }}
        style={{ width: 180 }}
      />

      <span style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: ts === null ? 'var(--accent-green)' : 'var(--accent-cyan)',
        minWidth: 96, textAlign: 'right',
      }}>
        {ts === null
          ? 'now'
          : new Date(cur * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

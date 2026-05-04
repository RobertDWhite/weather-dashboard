/** HRRR forecast loop — animated prediction of where convection will be over
 * the next 12 hours. Two products: composite reflectivity (default) and
 * near-surface smoke. Sourced via /hrrr/forecast and /hrrr/smoke.
 *
 * Plays as an autoplaying loop; user can scrub frame-by-frame. */
import { useEffect, useState } from 'react'
import type { HrrrForecastResponse } from '../types'
import { fetchHrrrForecast, fetchHrrrSmoke } from '../api'

const FRAME_MS = 600
type Field = 'refc' | 'smoke'

export default function HrrrLoopPanel() {
  const [field, setField] = useState<Field>('refc')
  const [data, setData] = useState<HrrrForecastResponse | null>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setImgError(false)
    setIdx(0)
    const fn = field === 'refc' ? () => fetchHrrrForecast(12) : () => fetchHrrrSmoke(12)
    fn()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    const t = setInterval(() => {
      fn().then((d) => { if (!cancelled) { setData(d); setIdx(0); setImgError(false) } }).catch(() => {})
    }, 30 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [field])

  useEffect(() => {
    if (!playing || !data?.frames?.length) return
    const t = setInterval(() => setIdx((i) => (i + 1) % data.frames.length), FRAME_MS)
    return () => clearInterval(t)
  }, [playing, data?.frames?.length])

  if (!loaded) return null
  // Hide entirely when no usable image source published — keeps the layout
  // clean instead of displaying a permanent broken panel
  if (!data?.frames?.length) return null

  const frame = data.frames[Math.min(idx, data.frames.length - 1)]

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">
        🔮 HRRR Forecast
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['refc', 'smoke'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setField(f)}
              style={{
                padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: field === f ? 'var(--accent-cyan)' : 'var(--bg-base)',
                color: field === f ? '#000' : 'var(--text-muted)',
                border: `1px solid ${field === f ? 'var(--accent-cyan)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {f === 'refc' ? 'Radar' : 'Smoke'}
            </button>
          ))}
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, alignSelf: 'center', marginLeft: 4 }}>
            {data.run_label}
          </span>
        </div>
      </div>

      <div style={{ background: '#000', minHeight: 140, position: 'relative' }}>
        {!imgError ? (
          <img
            src={frame.url}
            alt={`HRRR f${frame.fh}`}
            loading="lazy"
            style={{ width: '100%', display: 'block' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            Frame f{frame.fh} unavailable
          </div>
        )}
        <div style={{
          position: 'absolute', top: 6, left: 6,
          background: 'rgba(0,0,0,0.7)', padding: '3px 7px',
          borderRadius: 3, fontSize: 11, fontWeight: 700,
          color: '#fff', fontFamily: 'var(--font-mono)',
        }}>
          F{String(frame.fh).padStart(2, '0')} · {frame.valid_local_label}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--accent-cyan)', borderRadius: 3, padding: '2px 8px',
            cursor: 'pointer', fontSize: 11, fontWeight: 700,
          }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={data.frames.length - 1}
          value={idx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
          style={{ flex: 1 }}
        />
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
          minWidth: 36, textAlign: 'right',
        }}>
          {idx + 1}/{data.frames.length}
        </span>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', padding: '0 8px 6px' }}>
        Composite reflectivity · auto-refresh 30m
      </div>
    </div>
  )
}

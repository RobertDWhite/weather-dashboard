/** Recent earthquakes (USGS) — last 24h. Click to fly map. */
import type { Quake } from '../types'

interface Props {
  quakes: Quake[]
  onLocate?: (lat: number, lon: number) => void
  limit?: number
}

function colorForMag(mag: number): string {
  if (mag >= 7) return '#7f1d1d'
  if (mag >= 5) return '#ef4444'
  if (mag >= 3.5) return '#f97316'
  return '#facc15'
}

export default function QuakesPanel({ quakes, onLocate, limit = 8 }: Props) {
  if (!quakes?.length) return null
  // Only show M3.5+ in the side panel — full list is on the map
  const visible = quakes.filter((q) => (q.mag ?? 0) >= 3.5).slice(0, limit)
  if (!visible.length) return null
  return (
    <div className="card">
      <div className="card-title">
        🌍 Earthquakes M3.5+ <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(24h)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 6 }}>
        {visible.map((q, i) => {
          const color = colorForMag(q.mag ?? 0)
          return (
            <button
              key={`${i}-${q.time_ms}`}
              onClick={() => onLocate?.(q.lat, q.lon)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${color}`, borderRadius: 4,
                padding: '4px 8px', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
                  M{(q.mag ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {q.time_ms ? new Date(q.time_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{q.place}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

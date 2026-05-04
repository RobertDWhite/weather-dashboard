/** Active Spotter Network positions sidebar list — moving spotters first,
 * stationary after. Click to fly map. */
import type { Spotter } from '../types'

interface Props {
  spotters: Spotter[]
  onLocate?: (lat: number, lon: number) => void
  limit?: number
}

export default function SpottersPanel({ spotters, onLocate, limit = 12 }: Props) {
  if (!spotters?.length) return null
  const moving = spotters.filter((s) => (s.motion || '').toUpperCase() === 'MOVING')
  const stationary = spotters.filter((s) => (s.motion || '').toUpperCase() !== 'MOVING')
  const visible = [...moving, ...stationary].slice(0, limit)
  return (
    <div className="card">
      <div className="card-title">
        📡 Spotter Network
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
          ({spotters.length} active{moving.length ? `, ${moving.length} moving` : ''})
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 6, maxHeight: 260, overflowY: 'auto' }}>
        {visible.map((s, i) => {
          const mv = (s.motion || '').toUpperCase() === 'MOVING'
          const color = mv ? '#fbbf24' : '#22d3ee'
          return (
            <button
              key={`${i}-${s.callsign}`}
              onClick={() => onLocate?.(s.lat, s.lon)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${color}`, borderRadius: 4,
                padding: '3px 8px', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.callsign || '?'}
              </span>
              {mv && (
                <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 700 }}>
                  ▶ {s.direction_deg ?? '–'}°
                </span>
              )}
              {s.web && (
                <a href={s.web} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 9, color: 'var(--accent-cyan)', textDecoration: 'underline' }}>
                  feed
                </a>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

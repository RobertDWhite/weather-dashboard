/** Top active wildfires (by acres). Click to fly map. */
import type { Wildfire } from '../types'

interface Props {
  fires: Wildfire[]
  onLocate?: (lat: number, lon: number) => void
  limit?: number
}

export default function WildfiresPanel({ fires, onLocate, limit = 8 }: Props) {
  if (!fires?.length) return null
  const visible = fires.slice(0, limit)
  return (
    <div className="card">
      <div className="card-title">
        🔥 Active Wildfires <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>({fires.length})</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 6 }}>
        {visible.map((f, i) => (
          <button
            key={`${i}-${f.name}`}
            onClick={() => onLocate?.(f.lat, f.lon)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderLeft: '3px solid #dc2626', borderRadius: 4,
              padding: '4px 8px', cursor: 'pointer', textAlign: 'left',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5' }}>{f.name || 'Unnamed'}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {f.acres != null ? `${Math.round(f.acres).toLocaleString()} ac` : '—'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {f.state} {f.cause ? `· ${f.cause}` : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

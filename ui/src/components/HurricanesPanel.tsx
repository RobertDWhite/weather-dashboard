import type { HurricaneStorm } from '../types'

interface Props {
  storms: HurricaneStorm[]
  onLocate?: (lat: number, lon: number) => void
}

const CLASS_COLOR: Record<string, string> = {
  'TROPICAL DEPRESSION': '#60a5fa',
  'TROPICAL STORM': '#facc15',
  'HURRICANE': '#ef4444',
  'MAJOR HURRICANE': '#a855f7',
  'POST-TROPICAL CYCLONE': '#94a3b8',
}

export default function HurricanesPanel({ storms, onLocate }: Props) {
  if (!storms?.length) return null
  return (
    <div className="card">
      <div className="card-title">Active Tropical Systems ({storms.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
        {storms.map((s) => {
          const cls = (s.classification ?? '').toUpperCase()
          const color = CLASS_COLOR[cls] ?? '#22d3ee'
          return (
            <button
              key={s.id}
              onClick={() => s.latitude != null && s.longitude != null && onLocate?.(s.latitude, s.longitude)}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${color}55`,
                borderLeft: `3px solid ${color}`,
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color, fontSize: 12, fontWeight: 800 }}>
                  🌀 {s.classification} {s.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.intensity}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {s.windSpeed && <span>{s.windSpeed}</span>}
                {s.pressure && <span>{s.pressure} mb</span>}
                {s.movement && <span>{s.movement}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

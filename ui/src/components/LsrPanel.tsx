import type { LocalStormReport, LsrCategory } from '../types'

interface Props {
  items: LocalStormReport[]
  byCategory?: Record<LsrCategory, number>
  hours: number
  onLocate?: (lat: number, lon: number) => void
}

const CAT_COLOR: Record<LsrCategory, string> = {
  tornado: '#ef4444',
  hail: '#3b82f6',
  wind: '#f59e0b',
  flood: '#22c55e',
  lightning: '#facc15',
  winter: '#a855f7',
  fire: '#dc2626',
  other: '#94a3b8',
}
const CAT_EMOJI: Record<LsrCategory, string> = {
  tornado: '🌪',
  hail: '🧊',
  wind: '💨',
  flood: '🌊',
  lightning: '⚡',
  winter: '❄️',
  fire: '🔥',
  other: '•',
}
const CAT_ORDER: LsrCategory[] = ['tornado', 'hail', 'wind', 'flood', 'lightning', 'winter', 'fire', 'other']

export default function LsrPanel({ items, byCategory, hours, onLocate }: Props) {
  if (!items?.length) return null
  return (
    <div className="card">
      <div className="card-title">
        Local Storm Reports
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
          (last {hours}h, IEM)
        </span>
      </div>
      {byCategory && (
        <div style={{ display: 'flex', gap: 6, padding: '4px 8px', flexWrap: 'wrap' }}>
          {CAT_ORDER.filter((c) => (byCategory[c] ?? 0) > 0).map((c) => (
            <span
              key={c}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 3,
                background: `${CAT_COLOR[c]}22`,
                color: CAT_COLOR[c],
                border: `1px solid ${CAT_COLOR[c]}55`,
              }}
            >
              {CAT_EMOJI[c]} {byCategory[c]}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px 8px', maxHeight: 280, overflowY: 'auto' }}>
        {items.slice(0, 40).map((r, i) => (
          <button
            key={`${r.valid}-${i}`}
            onClick={() => onLocate?.(r.lat, r.lon)}
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 56px 1fr',
              gap: 4,
              alignItems: 'baseline',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              padding: '3px 0',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 11,
            }}
          >
            <span style={{ color: CAT_COLOR[r.category] }}>{CAT_EMOJI[r.category]}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 10 }}>
              {r.valid ? new Date(r.valid).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: CAT_COLOR[r.category], fontWeight: 700 }}>{r.type}</span>
              {r.magnitude != null && r.magnitude !== '' && (
                <span style={{ color: 'var(--accent-cyan)', marginLeft: 4 }}>{String(r.magnitude)}</span>
              )}
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                · {r.city}{r.state ? `, ${r.state}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

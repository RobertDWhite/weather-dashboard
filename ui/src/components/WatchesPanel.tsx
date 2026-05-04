import type { SpcWatch } from '../types'
import { useNow, formatCountdown } from '../hooks/useNow'

interface Props {
  watches: SpcWatch[]
  onLocate?: (lat: number, lon: number) => void
}

function centroid(geo: SpcWatch['geometry']): [number, number] | null {
  if (!geo) return null
  let coords: number[][] = []
  if (geo.type === 'Polygon') coords = geo.coordinates[0] as number[][]
  else if (geo.type === 'MultiPolygon') coords = (geo.coordinates as number[][][][])[0][0]
  if (!coords.length) return null
  return [
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
  ]
}

export default function WatchesPanel({ watches, onLocate }: Props) {
  const now = useNow(30_000)
  if (!watches?.length) return null
  return (
    <div className="card">
      <div className="card-title">Active Watches ({watches.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
        {watches.map((w) => {
          const isTor = (w.type || '').toLowerCase().includes('tornado')
          const color = w.is_pds ? '#ff00ff' : isTor ? '#ff2d55' : '#ffd60a'
          const c = centroid(w.geometry)
          const expMs = w.expires ? Date.parse(w.expires) : NaN
          const countdown = isFinite(expMs) ? formatCountdown(expMs, now) : null
          const expiringSoon = isFinite(expMs) && expMs - now < 30 * 60_000 && expMs - now > 0
          return (
            <button
              key={String(w.ww)}
              onClick={() => c && onLocate?.(c[0], c[1])}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, fontWeight: 700 }}>
                <span style={{ color }}>
                  {w.is_pds && <span style={{ marginRight: 4 }}>⚠ PDS</span>}
                  {w.type ?? 'Watch'} #{w.ww}
                </span>
                {countdown && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: countdown === 'expired' ? 'var(--text-muted)' : expiringSoon ? '#fde047' : color,
                      fontFamily: 'var(--font-mono)',
                    }}
                    title={w.expires ? new Date(w.expires).toLocaleString() : ''}
                  >
                    {countdown === 'expired' ? '· expired' : `· ${countdown}`}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {w.tornado_prob != null && <span>tor {w.tornado_prob}</span>}
                {w.max_hail_in != null && <span>hail {w.max_hail_in}"</span>}
                {w.max_wind_kt != null && <span>wind {w.max_wind_kt} kt</span>}
                {w.wfo && <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{w.wfo}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { fetchRiverGauges } from '../api'
import type { RiverGauge } from '../types'

interface Props {
  state?: string
  onLocate: (lat: number, lon: number, zoom?: number) => void
}

function gaugeColor(height: number): string {
  if (height < 5)  return 'var(--warn-green)'
  if (height < 10) return 'var(--warn-yellow)'
  if (height < 15) return 'var(--warn-orange)'
  return 'var(--warn-red)'
}

function gaugeStatus(height: number): string {
  if (height < 5)  return 'Normal'
  if (height < 10) return 'Action'
  if (height < 15) return 'Flood'
  return 'Major Flood'
}

export default function RiverGauges({ state, onLocate }: Props) {
  const [gauges, setGauges] = useState<RiverGauge[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!state) return
    setLoading(true)
    fetchRiverGauges(state)
      .then((d) => { setGauges(d.gauges); setLoading(false) })
      .catch(() => setLoading(false))
  }, [state])

  const elevated = gauges.filter((g) => g.height >= 10)
  const display = expanded ? gauges.slice(0, 30) : (elevated.length ? elevated : gauges).slice(0, 8)

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 8 }}>
        🌊 River Gauges — {state}
        <span style={{ marginLeft: 6, color: elevated.length > 0 ? 'var(--warn-orange)' : 'var(--warn-green)' }}>
          {elevated.length > 0 ? `${elevated.length} elevated` : '✓ normal levels'}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          {expanded ? 'Less ▲' : 'More ▼'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
          {display.map((g) => {
            const color = gaugeColor(g.height)
            const status = gaugeStatus(g.height)
            const pct = Math.min(100, (g.height / 20) * 100)
            return (
              <div
                key={g.siteCode}
                onClick={() => onLocate(g.lat, g.lon, 11)}
                style={{
                  padding: '6px 8px',
                  background: 'var(--bg-base)',
                  borderRadius: 5,
                  border: `1px solid ${g.height >= 10 ? color : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.siteName.replace(/\s+at\s+/i, ' @ ').replace(/\s+near\s+/i, ' ~ ')}
                  </span>
                  <span style={{ color, fontWeight: 700, fontSize: 12, marginLeft: 6, flexShrink: 0 }}>
                    {g.height.toFixed(1)} ft
                  </span>
                </div>
                <div className="gauge-bar">
                  <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                {g.height >= 10 && (
                  <div style={{ fontSize: 10, color, marginTop: 3 }}>{status}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

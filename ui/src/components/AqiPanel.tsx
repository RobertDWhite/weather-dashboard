import { useEffect, useState } from 'react'
import type { AqiCurrent } from '../types'
import { fetchAqi } from '../api'

interface Props {
  homeLat: number
  homeLon: number
  enabled?: boolean
}

export default function AqiPanel({ homeLat, homeLon, enabled = true }: Props) {
  const [data, setData] = useState<AqiCurrent | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAqi(homeLat, homeLon)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    const t = setInterval(() => {
      fetchAqi(homeLat, homeLon).then((d) => { if (!cancelled) setData(d) }).catch(() => {})
    }, 30 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [homeLat, homeLon, enabled])

  if (!enabled || !loaded || !data || data.observations.length === 0) return null
  const dom = data.dominant
  if (!dom) return null

  return (
    <div className="card">
      <div className="card-title">
        🌫 Air Quality
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
          ({dom.reporting_area}, {dom.state})
        </span>
      </div>
      <div style={{ padding: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '8px 12px',
          background: dom.category.color,
          borderRadius: 4,
          color: dom.category.band >= 4 ? '#fff' : '#000',
        }}>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{dom.aqi}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>{dom.category.name}</div>
            <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
              Dominant: {dom.parameter}
            </div>
          </div>
        </div>
        {data.observations.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {data.observations.map((o) => (
              <div
                key={o.parameter}
                title={`${o.parameter} · ${o.category.name}`}
                style={{
                  padding: '2px 6px',
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${o.category.color}33`,
                  color: o.category.color,
                  border: `1px solid ${o.category.color}77`,
                }}
              >
                {o.parameter} {o.aqi}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {dom.datetime_observed}
        </div>
      </div>
    </div>
  )
}

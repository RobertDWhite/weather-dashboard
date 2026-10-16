import { useFeed } from '../hooks/useFeed'
import { FeedStatus } from './FeedPanel'
import { fetchAqi } from '../api'

interface Props {
  homeLat: number
  homeLon: number
  enabled?: boolean
}

export default function AqiPanel({ homeLat, homeLon, enabled = true }: Props) {
  const feed = useFeed(`aqi:${homeLat}:${homeLon}`, s => fetchAqi(homeLat, homeLon, s), { enabled, interval: 600_000 })
  const data = feed.data
  if (!enabled) return null
  if (!data) return <FeedStatus feed={feed} name="Air quality" />
  if (!data.observations.length) return <><FeedStatus feed={feed} name="Air quality" />{feed.status === 'success' && <p className="notice">No air quality observations available.</p>}</>
  const dom = data.dominant
  if (!dom) return null

  return (
    <div className="card">
      <FeedStatus feed={feed} name="Air quality" />
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

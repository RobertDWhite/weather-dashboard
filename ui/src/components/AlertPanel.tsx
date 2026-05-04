import type { NWSAlert } from '../types'
import { format, parseISO } from 'date-fns'

interface Props {
  alerts: NWSAlert[]
  onLocate: (lat: number, lon: number, zoom?: number) => void
  onOpenDrawer: (alertId: string) => void
}

const SEV_CLASS: Record<string, string> = {
  Extreme: 'sev-extreme',
  Severe: 'sev-severe',
  Moderate: 'sev-moderate',
  Minor: 'sev-minor',
}

const EVENT_EMOJI: Record<string, string> = {
  'Tornado Warning': '🌪️',
  'Tornado Watch': '👁️',
  'Severe Thunderstorm Warning': '⛈️',
  'Severe Thunderstorm Watch': '⛅',
  'Flash Flood Emergency': '🚨',
  'Flash Flood Warning': '🌊',
  'Flash Flood Watch': '🌧️',
  'Flood Warning': '💧',
  'Winter Storm Warning': '❄️',
  'Blizzard Warning': '🌨️',
  'High Wind Warning': '💨',
}

export default function AlertPanel({ alerts, onLocate, onOpenDrawer }: Props) {
  if (!alerts.length) {
    return (
      <div className="card">
        <div className="card-title">⚠ Active Alerts</div>
        <div style={{ color: 'var(--warn-green)', fontSize: 12, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          ✓ No active watches or warnings
        </div>
      </div>
    )
  }

  const sorted = [...alerts].sort((a, b) => {
    const order = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 }
    return (order[a.properties.severity as keyof typeof order] ?? 4) -
           (order[b.properties.severity as keyof typeof order] ?? 4)
  })

  return (
    <div className="card">
      <div className="card-title">
        <span>⚠ Active Alerts</span>
        <span style={{ marginLeft: 'auto', color: 'var(--warn-orange)', fontWeight: 700 }}>
          {alerts.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {sorted.map((a) => {
          const sev = a.properties.severity
          const emoji = EVENT_EMOJI[a.properties.event] ?? '⚠️'
          const endsAt = a.properties.ends || a.properties.expires
          const endsStr = endsAt ? format(parseISO(endsAt), 'h:mm a') : ''

          const locate = () => {
            const geo = a.geometry
            if (!geo) return
            let coords: number[][] = []
            if (geo.type === 'Polygon') coords = geo.coordinates[0] as number[][]
            else if (geo.type === 'MultiPolygon') coords = (geo.coordinates as number[][][][])[0][0]
            if (!coords.length) return
            const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
            const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length
            onLocate(lat, lon, 8)
          }

          return (
            <div
              key={a.properties.id}
              onClick={() => { locate(); onOpenDrawer(a.properties.id) }}
              style={{
                padding: '7px 9px',
                borderRadius: 5,
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span>{emoji}</span>
                <span className={`sev-pill ${SEV_CLASS[sev] ?? 'sev-unknown'}`}>{sev}</span>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>
                  {a.properties.event}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.properties.areaDesc}</div>
              {endsStr && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Until {endsStr}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

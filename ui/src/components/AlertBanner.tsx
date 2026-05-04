import { useEffect, useState } from 'react'
import type { NWSAlert } from '../types'

interface Props {
  alerts: NWSAlert[]
  onLocate: (lat: number, lon: number, zoom?: number) => void
  onOpenDrawer: (alertId: string) => void
}

const SEV_BG: Record<string, string> = {
  Extreme: 'rgba(255,45,85,0.15)',
  Severe: 'rgba(255,107,53,0.12)',
}
const SEV_BORDER: Record<string, string> = {
  Extreme: '#ff2d55',
  Severe: '#ff6b35',
}

export default function AlertBanner({ alerts, onLocate, onOpenDrawer }: Props) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (alerts.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % alerts.length), 5000)
    return () => clearInterval(t)
  }, [alerts.length])

  const alert = alerts[idx]
  if (!alert) return null
  const sev = alert.properties.severity
  const color = SEV_BORDER[sev] ?? '#ffd60a'
  const bg = SEV_BG[sev] ?? 'rgba(255,214,10,0.1)'

  const handleClick = () => {
    // Try to fly the map to the alert polygon
    const geo = alert.geometry
    if (geo?.type === 'Polygon') {
      const coords = geo.coordinates[0] as number[][]
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
      const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length
      onLocate(lat, lon, 8)
    }
    // Always open the drawer for full detail, focused on this alert
    onOpenDrawer(alert.properties.id)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-live="polite"
      aria-label={`${alert.properties.event} for ${alert.properties.areaDesc}. Click to view all active alerts.`}
      style={{
        background: bg,
        borderBottom: `2px solid ${color}`,
        padding: '7px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        flexShrink: 0,
        animation: 'slide-in 0.3s ease-out',
      }}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      title="Click to view all active alerts"
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>
        {sev === 'Extreme' ? '🌪️' : sev === 'Severe' ? '⛈️' : '⚠️'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color, fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>
          {alert.properties.event.toUpperCase()}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>
          {alert.properties.areaDesc}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
          {alert.properties.headline?.split(' until ')?.[1]
            ? `Until ${alert.properties.headline.split(' until ')[1]}`
            : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {alerts.length > 1 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {idx + 1}/{alerts.length}
          </span>
        )}
        <span style={{ fontSize: 10, color, fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 4, padding: '2px 7px' }}>
          VIEW ALL ↗
        </span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { NWSAlert } from '../types'

interface Props {
  alerts: NWSAlert[]
  onLocate?: (lat: number, lon: number) => void
  onOpenDrawer?: (id: string) => void
}

const EMERGENCY_RX = /tornado emergency|flash flood emergency|particularly dangerous situation/i

function centroid(geo: NWSAlert['geometry']): [number, number] | null {
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

/** Top-of-viewport blocking-ish banner for life-threatening events:
 * Tornado Emergency, Flash Flood Emergency, PDS situations. Strobing red.
 * Different from AlertBanner (which rotates ordinary Severe alerts). */
export default function EmergencyBanner({ alerts, onLocate, onOpenDrawer }: Props) {
  const [strobe, setStrobe] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setStrobe((s) => !s), 700)
    return () => clearInterval(t)
  }, [])

  const emergencies = alerts.filter((a) => {
    const ev = a.properties?.event || ''
    const hl = a.properties?.headline || ''
    return EMERGENCY_RX.test(ev) || EMERGENCY_RX.test(hl)
  })

  if (emergencies.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      aria-label={`${emergencies.length} life-threatening weather emergency active`}
      style={{
        background: strobe ? '#7f1d1d' : '#0b0b0b',
        borderTop: '4px solid #ef4444',
        borderBottom: '4px solid #ef4444',
        color: '#fff',
        padding: '14px 18px',
        boxShadow: '0 0 24px rgba(239,68,68,0.6)',
        transition: 'background 0.15s',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: emergencies.length > 1 ? 6 : 0 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>🚨</span>
        <span style={{ fontWeight: 900, letterSpacing: 1.5, fontSize: 13, textTransform: 'uppercase', color: '#ffd1d1' }}>
          LIFE-THREATENING EMERGENCY · {emergencies.length} ACTIVE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#fda4af', letterSpacing: 1 }}>
          TAKE ACTION NOW
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {emergencies.slice(0, 3).map((a) => {
          const p = a.properties
          const id = p?.id || a.id
          const c = centroid(a.geometry)
          return (
            <button
              key={id}
              onClick={() => {
                if (c && onLocate) onLocate(c[0], c[1])
                if (onOpenDrawer) onOpenDrawer(id)
              }}
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'system-ui,sans-serif',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
                {p?.event}
              </div>
              <div style={{ fontSize: 12, color: '#fecaca', lineHeight: 1.35 }}>
                {p?.areaDesc}
              </div>
              {p?.headline && (
                <div style={{ fontSize: 11, color: '#fda4af', marginTop: 4, lineHeight: 1.4 }}>
                  {p.headline}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

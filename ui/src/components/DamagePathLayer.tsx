/** NWS Damage Assessment Toolkit tornado tracks (last 7 days). */
import { useEffect, useState } from 'react'
import { GeoJSON } from 'react-leaflet'
import { fetchDamage } from '../api'

const EF_COLORS: Record<string, string> = {
  EF0: '#bef264', EF1: '#fde047', EF2: '#fb923c',
  EF3: '#ef4444', EF4: '#7f1d1d', EF5: '#fb7185',
}

export default function DamagePathLayer() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchDamage(7)
      .then((d) => { if (!cancelled) setData(d.tracks) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!data) return null
  return (
    <GeoJSON
      data={data}
      style={(feat) => {
        const ef = ((feat?.properties as Record<string, string>) || {}).ef_rating || 'EF0'
        const color = EF_COLORS[ef] || '#94a3b8'
        return { color, weight: 3, opacity: 0.85 }
      }}
      onEachFeature={(feat, l) => {
        const p = (feat.properties || {}) as Record<string, unknown>
        const ef = p.ef_rating || ''
        const date = p.event_date ? new Date(Number(p.event_date)).toLocaleString() : ''
        ;(l as L.Path).bindPopup(`<div style="color:#111;font-family:system-ui">
          <strong>${ef} damage track</strong><br/>${date}
        </div>`)
      }}
    />
  )
}

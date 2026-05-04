/** NWS zone overlay (CWA / fire / public / marine). Composable inside any
 * MapContainer. Auto-fetches once per layer choice, caches via React-Query
 * style staleness on the backend (24h). */
import { useEffect, useState } from 'react'
import { GeoJSON } from 'react-leaflet'
import { fetchNwsZones } from '../api'

type Layer = 'cwa' | 'fire' | 'public' | 'marine'

const STYLES: Record<Layer, { color: string; label: string }> = {
  cwa: { color: '#22d3ee', label: 'County Warning Areas' },
  fire: { color: '#f97316', label: 'Fire Weather Zones' },
  public: { color: '#94a3b8', label: 'Public Forecast Zones' },
  marine: { color: '#3b82f6', label: 'Marine Zones' },
}

export default function NwsZonesLayer({ layer }: { layer: Layer }) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    fetchNwsZones(layer)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [layer])

  if (!data) return null
  const style = STYLES[layer]

  return (
    <GeoJSON
      data={data}
      style={() => ({
        color: style.color,
        weight: 0.7,
        opacity: 0.6,
        fillColor: style.color,
        fillOpacity: 0.04,
      })}
      onEachFeature={(feat, l) => {
        const p = feat.properties || {}
        const name = (p as Record<string, unknown>).WFO ?? (p as Record<string, unknown>).NAME ?? (p as Record<string, unknown>).CWA ?? ''
        ;(l as L.Path).bindTooltip(String(name), { sticky: true })
      }}
    />
  )
}

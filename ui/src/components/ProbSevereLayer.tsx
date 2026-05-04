/** NOAA/CIMSS ProbSevere v3 + ProbTor — ML-derived storm hazard probabilities.
 *
 * Polls realearth.ssec.wisc.edu (CORS-open) every 2 min. Each feature is a
 * convective object polygon with PROB% for severe + tornado + LINE01..LINE15
 * diagnostic strings. Rendered colored by max(probsevere, probtor); popup
 * shows the full diagnostic text.
 */
import { useEffect, useState } from 'react'
import { Polygon, Popup } from 'react-leaflet'

interface PsModels {
  probsevere?: { PROB?: string; [k: string]: string | undefined }
  probtor?: { PROB?: string; [k: string]: string | undefined }
}
interface PsFeature {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: number[][][] }
  models?: PsModels
  properties?: Record<string, unknown>
}
interface PsCollection {
  type: 'FeatureCollection'
  features: PsFeature[]
}

function colorFor(prob: number): string {
  if (prob >= 90) return '#ff00ff'
  if (prob >= 70) return '#ff0000'
  if (prob >= 50) return '#ff8800'
  if (prob >= 30) return '#ffdd00'
  return '#ffffff'
}

interface Props {
  enabled: boolean
}

export default function ProbSevereLayer({ enabled }: Props) {
  const [features, setFeatures] = useState<PsFeature[]>([])

  useEffect(() => {
    if (!enabled) { setFeatures([]); return }
    let cancelled = false
    const tick = async () => {
      try {
        const r = await fetch('https://realearth.ssec.wisc.edu/api/shapes?products=PROBSEVEREV3&t=now')
        if (!r.ok) return
        const j: PsCollection = await r.json()
        if (cancelled) return
        setFeatures(Array.isArray(j.features) ? j.features : [])
      } catch {
        // upstream flaky; keep last frame
      }
    }
    tick()
    const t = setInterval(tick, 2 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      {features.map((f, i) => {
        if (f.geometry?.type !== 'Polygon') return null
        // GeoJSON coordinates are [lon, lat]; Leaflet wants [lat, lon].
        const ring = f.geometry.coordinates[0] ?? []
        if (ring.length < 3) return null
        const positions = ring.map(([lon, lat]) => [lat, lon] as [number, number])
        const ps = parseInt(f.models?.probsevere?.PROB ?? '0', 10) || 0
        const pt = parseInt(f.models?.probtor?.PROB ?? '0', 10) || 0
        const prob = Math.max(ps, pt)
        const color = colorFor(prob)
        const lines = Object.entries(f.models?.probsevere ?? {})
          .filter(([k]) => k.startsWith('LINE'))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v as string)
        const torLines = Object.entries(f.models?.probtor ?? {})
          .filter(([k]) => k.startsWith('LINE'))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v as string)
        return (
          <Polygon
            key={`ps-${i}`}
            positions={positions}
            pathOptions={{ color, weight: 2, opacity: 0.9, fillOpacity: 0.18 }}
          >
            <Popup>
              <div style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 360 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color }}>
                  ProbSevere {ps}% · ProbTor {pt}%
                </div>
                {lines.map((l, j) => <div key={`l-${j}`}>{l}</div>)}
                {torLines.length > 1 && (
                  <>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>ProbTor diagnostics</div>
                    {torLines.map((l, j) => <div key={`t-${j}`}>{l}</div>)}
                  </>
                )}
                <div style={{ marginTop: 6, fontSize: 9, color: '#888' }}>
                  CIMSS / NOAA NESDIS via SSEC RealEarth
                </div>
              </div>
            </Popup>
          </Polygon>
        )
      })}
    </>
  )
}

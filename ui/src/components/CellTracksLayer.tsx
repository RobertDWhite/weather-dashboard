/** Storm cell motion tracks — polylines connecting consecutive scans of
 * the same NEXRAD attribute cell over the last hour. Drop in a MapContainer.
 */
import { useEffect, useState } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import type { CellTrack } from '../types'
import { fetchCellTracks } from '../api'

export default function CellTracksLayer() {
  const [tracks, setTracks] = useState<CellTrack[]>([])

  useEffect(() => {
    let cancelled = false
    const tick = () => fetchCellTracks()
      .then((d) => { if (!cancelled) setTracks(d.tracks) })
      .catch(() => {})
    tick()
    const t = setInterval(tick, 2 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return (
    <>
      {tracks.map((t) => {
        const positions = t.points.map((p) => [p.lat, p.lon] as [number, number])
        if (positions.length < 2) return null
        const last = t.points[t.points.length - 1]
        const tvs = last.tvs === 'TVS'
        const meso = !!last.meso
        const color = tvs ? '#ef4444' : meso ? '#facc15' : '#94a3b8'
        return (
          <>
            <Polyline
              key={`tk-${t.key}`}
              positions={positions}
              pathOptions={{ color, weight: 2, opacity: 0.8 }}
            />
            <CircleMarker
              key={`tk-end-${t.key}`}
              center={positions[positions.length - 1]}
              radius={3}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 1 }}
            >
              <Tooltip direction="top">
                Cell {t.storm_id} ({t.points.length} scans)
                {last.max_dbz != null ? ` · ${last.max_dbz}dBZ` : ''}
                {tvs ? ' · TVS' : meso ? ' · MESO' : ''}
              </Tooltip>
            </CircleMarker>
          </>
        )
      })}
    </>
  )
}

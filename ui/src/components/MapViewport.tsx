import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import type { MapPosition } from '../mapWorkflows'
export interface MapViewportProps {
  center: [number, number]
  position?: MapPosition | null
  onPositionChange?: (position: MapPosition) => void
}
export default function MapViewport({ center, position, onPositionChange }: MapViewportProps) {
  const map = useMap()
  const [lat, lon] = center
  const targetLat = position?.lat ?? lat,
    targetLon = position?.lon ?? lon,
    targetZoom = position?.zoom ?? 6
  useEffect(() => {
    const current = map.getCenter()
    if (
      Math.abs(current.lat - targetLat) > 0.000001 ||
      Math.abs(current.lng - targetLon) > 0.000001 ||
      map.getZoom() !== targetZoom
    )
      map.setView([targetLat, targetLon], targetZoom, { animate: false })
  }, [map, targetLat, targetLon, targetZoom])
  useEffect(() => {
    const changed = () => {
      const c = map.getCenter()
      onPositionChange?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
    }
    map.on('moveend', changed)
    return () => {
      map.off('moveend', changed)
    }
  }, [map, onPositionChange])
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const center = map.getCenter(),
        zoom = map.getZoom()
      map.invalidateSize({ pan: false })
      const options = { animate: false, reset: true }
      map.setView(center, zoom, options)
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

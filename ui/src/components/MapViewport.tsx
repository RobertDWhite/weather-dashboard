import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
export default function MapViewport({ center }: { center: [number, number] }) {
  const map = useMap()
  const [lat, lon] = center
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: false })
  }, [lat, lon, map])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

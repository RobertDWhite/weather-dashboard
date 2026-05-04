/** MRMS composite reflectivity overlay (NOAA GeoServer WMS).
 *
 * MRMS = Multi-Radar / Multi-Sensor — the operational mosaic NWS forecasters
 * use. The conus_cref_qcd layer is QC'd column max reflectivity, which fills
 * the gap RainViewer leaves at z >= 8 (no real tiles past that) without
 * requiring the user to pick a single NEXRAD site.
 */
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface Props {
  enabled: boolean
  refreshKey: number
  opacity?: number
}

export default function MrmsLayer({ enabled, refreshKey, opacity = 0.65 }: Props) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer.WMS | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
      return
    }
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    const layer = L.tileLayer.wms('https://opengeo.ncep.noaa.gov/geoserver/conus/ows', {
      layers: 'conus_cref_qcd',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity,
      zIndex: 220,
      attribution: 'MRMS via <a href="https://opengeo.ncep.noaa.gov/" target="_blank" rel="noopener noreferrer">NOAA GeoServer</a>',
      // @ts-expect-error: cache-bust param accepted at runtime
      _t: refreshKey,
    })
    layer.addTo(map)
    layerRef.current = layer
  }, [enabled, refreshKey, opacity, map])

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [])

  return null
}

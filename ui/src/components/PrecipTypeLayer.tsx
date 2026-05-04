/** MRMS surface precipitation type — rain / snow / mix / freezing rain.
 *
 * NOAA GeoServer conus_pcpn_typ. Critical winter-weather context layer that
 * tells you instantly where a band is changing over.
 */
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface Props {
  enabled: boolean
  refreshKey: number
  opacity?: number
}

export default function PrecipTypeLayer({ enabled, refreshKey, opacity = 0.55 }: Props) {
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
      layers: 'conus_pcpn_typ',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity,
      zIndex: 215,
      attribution: 'MRMS PType via <a href="https://opengeo.ncep.noaa.gov/" target="_blank" rel="noopener noreferrer">NOAA GeoServer</a>',
      // @ts-expect-error: cache-bust accepted at runtime
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

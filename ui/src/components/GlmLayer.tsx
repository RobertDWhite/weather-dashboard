/** GOES-East GLM Flash Extent Density — geostationary lightning detection.
 *
 * Tiled raster from SSEC RealEarth, refreshes every minute. Geostationary
 * lightning catches in-cloud flashes ground-based networks miss; pairs well
 * with MRMS reflectivity for tracking severe convective cores.
 */
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface Props {
  enabled: boolean
  refreshKey: number
  opacity?: number
}

export default function GlmLayer({ enabled, refreshKey, opacity = 0.75 }: Props) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

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
    // Cache-bust via querystring; SSEC ignores unknown params, browser keys
    // its cache on full URL so refreshKey ticks force a fresh fetch.
    const url = `https://realearth.ssec.wisc.edu/tiles/GOESEastGLMFEDRadC/{z}/{x}/{y}.png?t=${refreshKey}`
    const layer = L.tileLayer(url, {
      opacity,
      zIndex: 230,
      maxNativeZoom: 6,
      attribution: 'GOES-East GLM via <a href="https://realearth.ssec.wisc.edu/" target="_blank" rel="noopener noreferrer">SSEC RealEarth</a>',
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

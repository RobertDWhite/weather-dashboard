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
    let cancelled = false
    // Resolve the latest available frame and request its time-stamped tiles.
    // The un-stamped /tiles/PRODUCT/z/x/y.png path makes RealEarth render the
    // "latest" composite on the fly, which it brands with a "Size limit
    // exceeded" watermark; the date/time path serves clean cached tiles. The
    // timestamp also cache-busts naturally, so no querystring is needed.
    const build = async () => {
      let stamp = ''
      try {
        const r = await fetch('https://realearth.ssec.wisc.edu/api/times?products=GOESEastGLMFEDRadC')
        if (r.ok) {
          const j = await r.json()
          const times: string[] = j?.GOESEastGLMFEDRadC ?? []
          const latest = times[times.length - 1]
          if (latest) stamp = latest.replace('.', '/') // "YYYYMMDD.HHMMSS" -> "YYYYMMDD/HHMMSS"
        }
      } catch {
        // upstream flaky; fall back to the un-stamped (watermarked) path below
      }
      if (cancelled) return
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
      const path = stamp ? `GOESEastGLMFEDRadC/${stamp}` : 'GOESEastGLMFEDRadC'
      const url = `https://realearth.ssec.wisc.edu/tiles/${path}/{z}/{x}/{y}.png`
      const layer = L.tileLayer(url, {
        opacity,
        zIndex: 230,
        maxNativeZoom: 6,
        attribution: 'GOES-East GLM via <a href="https://realearth.ssec.wisc.edu/" target="_blank" rel="noopener noreferrer">SSEC RealEarth</a>',
      })
      layer.addTo(map)
      layerRef.current = layer
    }
    build()
    return () => { cancelled = true }
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

/** Single-site NEXRAD overlay. Renders NOAA GeoServer WMS tiles for a chosen
 * WSR-88D site + product. Use inside a MapContainer.
 *
 * NOTE: IEM RIDGE TMS (mesonet.agron) only serves the CONUS composite — its
 * per-site URLs return "Invalid TMS Request" PNGs at every zoom. NOAA's
 * GeoServer at opengeo.ncep.noaa.gov has true per-site WMS layers and is the
 * actual source for radar.weather.gov.
 */
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface Props {
  enabled: boolean
  site: string
  product: string
  siteLat?: number
  siteLon?: number
  refreshKey: number
  opacity?: number
}

const RADAR_RADIUS_DEG = 2.7

// IEM-style product codes → NOAA GeoServer layer suffix. NOAA exposes a
// narrower product set per site (5 layers); collapse the IEM codes onto the
// closest equivalent so the existing picker still works.
function noaaLayerFor(site: string, product: string): string {
  const s = site.toLowerCase()
  const p = product.toUpperCase()
  // Velocity products
  if (p.startsWith('N0U') || p.startsWith('N0V') || p === 'BVEL' || p.includes('VEL')) {
    return `${s}_sr_bvel`
  }
  // Hydrometeor classification
  if (p === 'HCA' || p === 'N0H' || p === 'NXH') {
    return `${s}_boha`
  }
  // Storm-total / one-hour accumulation
  if (p === 'DSP' || p === 'DSA' || p === 'STA' || p.includes('ACC')) {
    return `${s}_bdsa`
  }
  // Digital hybrid reflectivity
  if (p === 'DHR' || p === 'NXC') {
    return `${s}_bdhc`
  }
  // Default — base reflectivity (N0Q, N0R, NCR, NCZ, BREF, etc.)
  return `${s}_sr_bref`
}

export default function NexradLayer({ enabled, site, product, siteLat, siteLon, refreshKey, opacity = 0.7 }: Props) {
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

    const bounds = (siteLat != null && siteLon != null)
      ? L.latLngBounds(
          [siteLat - RADAR_RADIUS_DEG, siteLon - RADAR_RADIUS_DEG],
          [siteLat + RADAR_RADIUS_DEG, siteLon + RADAR_RADIUS_DEG],
        )
      : undefined

    if (!bounds) {
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

    const layerName = noaaLayerFor(site, product)
    const wmsUrl = `https://opengeo.ncep.noaa.gov/geoserver/${site.toLowerCase()}/ows`

    const layer = L.tileLayer.wms(wmsUrl, {
      layers: layerName,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity,
      zIndex: 250,
      minNativeZoom: 6,
      maxNativeZoom: 12,
      minZoom: 6,
      bounds,
      // Cache-bust by appending refreshKey as a non-WMS param — GeoServer
      // ignores unknown params but the browser keys its cache on the full URL.
      // @ts-expect-error: extra WMS param accepted by Leaflet at runtime
      _t: refreshKey,
      attribution: 'NEXRAD via <a href="https://opengeo.ncep.noaa.gov/" target="_blank" rel="noopener noreferrer">NOAA GeoServer</a>',
    })
    layer.addTo(map)
    layerRef.current = layer
  }, [enabled, site, product, siteLat, siteLon, refreshKey, opacity, map])

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

import { MutableRefObject, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvent,
  ScaleControl,
  CircleMarker,
  Popup,
} from 'react-leaflet'
import type { Map as LeafletMap, StyleFunction } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { format, parseISO } from 'date-fns'
import type {
  AprsStation,
  HurricaneStorm,
  LocalStormReport,
  MesoscaleDiscussion,
  MetarStation,
  NWSAlert,
  NWSAlertsResponse,
  Quake,
  SpcWatch,
  StormCell,
  StormReports,
  Wildfire,
} from '../types'
import { fetchZoneGeometries } from '../api'
import CameraPanel from './CameraPanel'
import MapViewport, { type MapViewportProps } from './MapViewport'
import { alertZonePaths, geometryRevision } from '../mapData'
import type { Basemap } from '../mapWorkflows'
import HazardLayers from './HazardLayers'
import NexradLayer from './NexradLayer'
import RangeRings from './RangeRings'

interface Props extends Omit<MapViewportProps, 'center'> {
  basemap?: Basemap
  mapRef: MutableRefObject<LeafletMap | null>
  alerts: NWSAlertsResponse | null
  reports: StormReports | null
  homeCenter: [number, number]
  aprsStations?: AprsStation[]
  hurricanes?: HurricaneStorm[]
  watches?: SpcWatch[]
  mesoscales?: MesoscaleDiscussion[]
  metars?: MetarStation[]
  showMetars?: boolean
  lsrs?: LocalStormReport[]
  cells?: StormCell[]
  fires?: Wildfire[]
  quakes?: Quake[]
  showCells?: boolean
  showFires?: boolean
  showQuakes?: boolean
  spotters?: import('../types').Spotter[]
  showSpotters?: boolean
  nexrad?: { site: string; product: string; refreshKey: number; lat?: number; lon?: number } | null
  showRangeRings?: boolean
}

function MapRefCapture({ mapRef }: { mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

const SEV_COLOR: Record<string, string> = {
  Extreme: '#ff2d55',
  Severe: '#ff6b35',
  Moderate: '#ffd60a',
  Minor: '#30d158',
  Unknown: '#888888',
}
const SEV_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown']

function sevColor(sev: string) {
  return SEV_COLOR[sev] ?? '#888888'
}

const EVENT_EMOJI: Record<string, string> = {
  'Tornado Warning': '🌪️',
  'Tornado Watch': '👁️',
  'Severe Thunderstorm Warning': '⛈️',
  'Severe Thunderstorm Watch': '⛅',
  'Flash Flood Emergency': '🚨',
  'Flash Flood Warning': '🌊',
  'Flash Flood Watch': '🌧️',
  'Flood Warning': '💧',
  'Flood Watch': '💧',
  'Winter Storm Warning': '❄️',
  'Winter Storm Watch': '❄️',
  'Blizzard Warning': '🌨️',
  'Ice Storm Warning': '🧊',
  'High Wind Warning': '💨',
  'Freeze Watch': '🌡️',
  'Freeze Warning': '🌡️',
  'Frost Advisory': '❄️',
  'Dense Fog Advisory': '🌫️',
  'Special Weather Statement': '📢',
}

function popupCentroid(geo: NWSAlert['geometry']): [number, number] | null {
  if (!geo) return null
  let coords: number[][] = []
  if (geo.type === 'Polygon') coords = geo.coordinates[0] as number[][]
  else if (geo.type === 'MultiPolygon') coords = (geo.coordinates as number[][][][])[0][0]
  if (!coords.length) return null
  return [
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
  ]
}

function PopupCameraWirer({ onCamera }: { onCamera: (lat: number, lon: number, label: string) => void }) {
  useMapEvent('popupopen', (e) => {
    const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>('[data-cam-lat]')
    if (!btn) return
    const lat = parseFloat(btn.dataset.camLat ?? '')
    const lon = parseFloat(btn.dataset.camLon ?? '')
    const label = btn.dataset.camLabel ?? ''
    if (isNaN(lat) || isNaN(lon)) return
    btn.onclick = (ev) => {
      ev.stopPropagation()
      onCamera(lat, lon, label)
    }
  })
  return null
}

export default function AlertsMap({
  mapRef,
  alerts,
  reports,
  homeCenter,
  aprsStations,
  hurricanes,
  watches,
  mesoscales,
  metars,
  showMetars,
  lsrs,
  cells,
  fires,
  quakes,
  showCells,
  showFires,
  showQuakes,
  spotters,
  showSpotters,
  nexrad,
  basemap = 'dark',
  showRangeRings,
  position,
  onPositionChange,
}: Props) {
  const [hiddenSev, setHiddenSev] = useState<Set<string>>(new Set())
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lon: number; label: string } | null>(null)
  const [zoneGeos, setZoneGeos] = useState<Record<string, GeoJSON.Geometry>>({})

  const allAlerts = alerts?.features ?? []

  const zonesKey = JSON.stringify(alertZonePaths(allAlerts))
  const [zoneError, setZoneError] = useState(false)
  const [zoneRetry, setZoneRetry] = useState(0)
  useEffect(() => {
    const paths: string[] = JSON.parse(zonesKey)
    const controller = new AbortController()
    setZoneGeos({})
    setZoneError(false)
    if (paths.length)
      fetchZoneGeometries(paths, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setZoneGeos(data)
            setZoneError(paths.some((path) => !data[path]))
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setZoneError(true)
        })
    return () => controller.abort()
  }, [zonesKey, zoneRetry])

  // Count per severity
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    allAlerts.forEach((a) => {
      const s = a.properties.severity
      c[s] = (c[s] ?? 0) + 1
    })
    return c
  }, [allAlerts])

  // Alerts with their own polygon geometry
  const visible = useMemo(
    () => allAlerts.filter((a) => a.geometry && !hiddenSev.has(a.properties.severity)),
    [allAlerts, hiddenSev],
  )

  // Zone-based alerts resolved to zone geometries
  const zoneFeatures = useMemo(() => {
    if (!Object.keys(zoneGeos).length) return []
    return allAlerts
      .filter((a) => !a.geometry && !hiddenSev.has(a.properties.severity))
      .flatMap((a) => {
        const zones: string[] = (a.properties as unknown as { affectedZones?: string[] }).affectedZones ?? []
        const resolved = zones
          .map((url) => {
            const m = url.match(/\/zones\/([^/]+\/[^/]+)$/)
            return m ? zoneGeos[m[1]] : null
          })
          .filter(Boolean) as GeoJSON.Geometry[]
        return resolved.map((geo, i) => ({
          type: 'Feature' as const,
          geometry: geo,
          properties: { ...a.properties, _zoneIdx: i },
        }))
      })
  }, [allAlerts, hiddenSev, zoneGeos])

  // GeoJSON key forces re-render when data changes
  const geoKey = geometryRevision(allAlerts)

  const styleFor: StyleFunction = (feature) => {
    const sev: string = (feature as unknown as NWSAlert).properties?.severity ?? 'Unknown'
    const color = sevColor(sev)
    return { color, weight: 1.5, fillColor: color, fillOpacity: 0.18, opacity: 0.9 }
  }

  const zoneStyleFor: StyleFunction = (feature) => {
    const sev: string = (feature as unknown as NWSAlert).properties?.severity ?? 'Unknown'
    const color = sevColor(sev)
    return { color, weight: 1, fillColor: color, fillOpacity: 0.07, opacity: 0.55, dashArray: '4 4' }
  }

  function onEachFeature(feature: GeoJSON.Feature, layer: L.Layer) {
    const alert = feature as unknown as NWSAlert
    const p = alert.properties
    if (!p) return
    const emoji = EVENT_EMOJI[p.event] ?? '⚠️'
    const color = sevColor(p.severity)
    const endsAt = p.ends || p.expires
    const endsStr = endsAt ? format(parseISO(endsAt), 'MMM d, h:mm a') : null
    const office = p.senderName?.replace('NWS ', '') ?? ''
    const center = popupCentroid(alert.geometry)
    const areaShort = p.areaDesc.split(';')[0].trim()

    const camBtn = center
      ? `<button data-cam-lat="${center[0]}" data-cam-lon="${center[1]}" data-cam-label="${areaShort}"
           style="margin-top:8px;width:100%;padding:5px 8px;background:#0d1f3c;border:1px solid #00d4ff55;
                  border-radius:4px;color:#00d4ff;font-size:11px;font-weight:700;cursor:pointer;
                  letter-spacing:0.5px;font-family:system-ui,sans-serif">
           📷 Live Feeds
         </button>`
      : ''

    ;(layer as L.Path).bindPopup(
      `<div style="max-width:300px;font-family:system-ui,sans-serif;color:#111">
        <div style="font-weight:800;font-size:13px;margin-bottom:4px">
          ${emoji} ${p.event}
        </div>
        <div style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;
             background:${color}22;color:${color};border:1px solid ${color}55;margin-bottom:6px">
          ${p.severity}
        </div>
        <div style="font-size:11px;color:#444;margin-bottom:4px">${p.areaDesc}</div>
        ${endsStr ? `<div style="font-size:10px;color:#777">Until ${endsStr}${office ? ` · ${office}` : ''}</div>` : ''}
        ${p.headline ? `<div style="font-size:10px;color:#555;margin-top:6px;line-height:1.5">${p.headline}</div>` : ''}
        ${camBtn}
      </div>`,
      { maxWidth: 320 },
    )
  }

  const toggleSev = (sev: string) =>
    setHiddenSev((prev) => {
      const next = new Set(prev)
      next.has(sev) ? next.delete(sev) : next.add(sev)
      return next
    })

  return (
    <div className="alerts-map-frame">
      {zoneError && (
        <p className="notice" role="status">
          Some alert areas could not be drawn. Alert counts still include them.{' '}
          <button onClick={() => setZoneRetry((n) => n + 1)}>Retry areas</button>
        </p>
      )}
      <MapContainer
        center={[38, -97]}
        zoom={4}
        minZoom={3}
        maxZoom={14}
        style={{ width: '100%', flex: 1, minHeight: 0 }}
        zoomControl={true}
        attributionControl={true}
      >
        <MapRefCapture mapRef={mapRef} />
        <MapViewport center={homeCenter} position={position} onPositionChange={onPositionChange} />
        <PopupCameraWirer onCamera={(lat, lon, label) => setCameraTarget({ lat, lon, label })} />
        <ScaleControl position="bottomright" imperial={true} metric={true} />

        <TileLayer
          key={basemap}
          url={
            basemap === 'satellite'
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              : basemap === 'street'
                ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
          }
          attribution="Esri, OpenStreetMap contributors"
          maxNativeZoom={16}
          zIndex={1}
        />
        {basemap === 'dark' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
            zIndex={2}
          />
        )}

        {/* Zone-based alerts (lighter, dashed) */}
        {zoneFeatures.length > 0 && (
          <GeoJSON
            key={`zones-${geoKey}-${[...hiddenSev].join()}-${geometryRevision(zoneGeos)}`}
            data={{ type: 'FeatureCollection', features: zoneFeatures } as GeoJSON.FeatureCollection}
            style={zoneStyleFor}
            onEachFeature={onEachFeature}
          />
        )}

        {/* Polygon alerts (solid, higher opacity) */}
        {visible.length > 0 && (
          <GeoJSON
            key={`alerts-${geoKey}-${[...hiddenSev].join()}`}
            data={{ type: 'FeatureCollection', features: visible } as GeoJSON.FeatureCollection}
            style={styleFor}
            onEachFeature={onEachFeature}
          />
        )}

        {/* Storm report markers */}
        {(reports?.tornado ?? []).map((r, i) => (
          <CircleMarker
            key={`torn-${i}`}
            center={[r.lat, r.lon]}
            radius={7}
            pathOptions={{ color: '#ff0000', fillColor: '#ff0000', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div style={{ color: '#111' }}>
                <strong>🌪️ Tornado</strong> {r.magnitude && `EF${r.magnitude}`}
                <br />
                {r.location}, {r.state}
                <br />
                <small>{r.comment}</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        {(reports?.hail ?? []).map((r, i) => (
          <CircleMarker
            key={`hail-${i}`}
            center={[r.lat, r.lon]}
            radius={5}
            pathOptions={{ color: '#00ccff', fillColor: '#00ccff', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div style={{ color: '#111' }}>
                <strong>🧊 Hail</strong> {r.size}&quot;
                <br />
                {r.location}, {r.state}
              </div>
            </Popup>
          </CircleMarker>
        ))}
        {(reports?.wind ?? []).map((r, i) => (
          <CircleMarker
            key={`wind-${i}`}
            center={[r.lat, r.lon]}
            radius={4}
            pathOptions={{ color: '#ffaa00', fillColor: '#ffaa00', fillOpacity: 0.8, weight: 1.5 }}
          >
            <Popup>
              <div style={{ color: '#111' }}>
                <strong>💨 High Wind</strong> {r.speed && `${r.speed} mph`}
                <br />
                {r.location}, {r.state}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Home marker */}
        <CircleMarker
          center={homeCenter}
          radius={7}
          pathOptions={{ color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <div style={{ color: '#111', fontWeight: 700 }}>Home Station</div>
          </Popup>
        </CircleMarker>

        {/* Severe-weather overlays — hurricanes, watches, mesoscale discussions, METAR mesh, LSRs. */}
        <HazardLayers
          storms={hurricanes}
          watches={watches}
          mesoscales={mesoscales}
          metars={metars}
          showMetars={showMetars}
          lsrs={lsrs}
          cells={cells}
          showCells={showCells}
          fires={fires}
          showFires={showFires}
          quakes={quakes}
          showQuakes={showQuakes}
          spotters={spotters}
          showSpotters={showSpotters}
        />

        {nexrad && nexrad.site && (
          <NexradLayer
            enabled
            site={nexrad.site}
            product={nexrad.product}
            siteLat={nexrad.lat}
            siteLon={nexrad.lon}
            refreshKey={nexrad.refreshKey}
          />
        )}

        {showRangeRings && <RangeRings center={homeCenter} />}

        {/* APRS stations */}
        {(aprsStations ?? []).map((s) => {
          const wx = s.weather
          return (
            <CircleMarker
              key={s.callsign}
              center={[s.latitude, s.longitude]}
              radius={6}
              pathOptions={{ color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.85, weight: 1.5 }}
            >
              <Popup>
                <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 160 }}>
                  <strong>🌡 {s.callsign}</strong>
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    {wx?.temp_f != null && <div>Temp: {wx.temp_f}°F</div>}
                    {wx?.humidity_pct != null && <div>Humidity: {wx.humidity_pct}%</div>}
                    {wx?.wind_gust_mph != null && (
                      <div>
                        Gust: {wx.wind_gust_mph} mph{wx.wind_dir_deg != null ? ` @ ${wx.wind_dir_deg}°` : ''}
                      </div>
                    )}
                    {wx?.wind_speed_mph != null && <div>Wind: {wx.wind_speed_mph} mph</div>}
                    {wx?.pressure_mbar != null && <div>Pressure: {wx.pressure_mbar} mb</div>}
                    {wx?.rain_1h_in != null && <div>Rain 1h: {wx.rain_1h_in}&quot;</div>}
                    {wx?.rain_24h_in != null && <div>Rain 24h: {wx.rain_24h_in}&quot;</div>}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="severity-controls" aria-label="Alert severity filters">
        <strong>Severity</strong>
        {SEV_ORDER.filter((sev) => counts[sev]).map((sev) => (
          <button key={sev} aria-pressed={!hiddenSev.has(sev)} onClick={() => toggleSev(sev)}>
            <span aria-hidden="true" style={{ color: sevColor(sev) }}>
              ●
            </span>{' '}
            {sev} ({counts[sev]})
          </button>
        ))}
        <span>{alerts === null ? 'Alerts unavailable' : `${allAlerts.length} total`}</span>
      </div>

      {/* Camera panel modal triggered from popup */}
      {cameraTarget && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(6,11,20,0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setCameraTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-bright)',
              borderRadius: 10,
              overflow: 'hidden',
              width: '100%',
              maxWidth: 700,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                📷 Live Feeds — {cameraTarget.label}
              </div>
              <button
                onClick={() => setCameraTarget(null)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 4,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: 12 }}>
              <CameraPanel
                lat={cameraTarget.lat}
                lon={cameraTarget.lon}
                label={cameraTarget.label}
                radiusMiles={50}
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {alerts !== null && allAlerts.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 1000,
            background: 'rgba(6,11,20,0.85)',
            border: '1px solid var(--border-bright)',
            borderRadius: 8,
            padding: '16px 24px',
            color: 'var(--warn-green)',
            fontSize: 13,
            fontWeight: 700,
            backdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          ✓ No active NWS alerts
        </div>
      )}
    </div>
  )
}

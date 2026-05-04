import { useEffect, useRef, useState, MutableRefObject } from 'react'
import { MapContainer, TileLayer, GeoJSON, LayersControl, CircleMarker, Popup, useMap, ScaleControl } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRadarTimestamps, fetchSpcOutlookDay1 } from '../api'
import type {
  AprsStation, HurricaneStorm, LocalStormReport, MesoscaleDiscussion, MetarStation,
  NWSAlertsResponse, Quake, RadarTimestamps, SpcWatch, StormCell, StormReports, Wildfire,
} from '../types'
import HazardLayers from './HazardLayers'
import NexradLayer from './NexradLayer'
import MrmsLayer from './MrmsLayer'
import GlmLayer from './GlmLayer'
import PrecipTypeLayer from './PrecipTypeLayer'
import ProbSevereLayer from './ProbSevereLayer'
import RangeRings from './RangeRings'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Props {
  mapRef: MutableRefObject<LeafletMap | null>
  alerts: NWSAlertsResponse | null
  reports: StormReports | null
  center: [number, number]
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
  showMrms?: boolean
  showGlm?: boolean
  showPType?: boolean
  showProbSevere?: boolean
  showRangeRings?: boolean
  /** When set, snap radar to the past frame nearest this epoch-second value
   * and freeze auto-loop. Used by the time-machine scrubber. */
  forceTimestamp?: number | null
}

function MapRefCapture({ mapRef }: { mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map, mapRef])
  return null
}

const ALERT_COLORS: Record<string, string> = {
  'Tornado Warning': '#ff0000',
  'Tornado Watch': '#ffff00',
  'Severe Thunderstorm Warning': '#ffa500',
  'Severe Thunderstorm Watch': '#db8000',
  'Flash Flood Emergency': '#ff0000',
  'Flash Flood Warning': '#00cc00',
  'Flash Flood Watch': '#2e8b57',
  'Flood Warning': '#00ff00',
  'Winter Storm Warning': '#ff69b4',
  'Blizzard Warning': '#ff4500',
  'Ice Storm Warning': '#8b0000',
  'High Wind Warning': '#daa520',
  'Hurricane Warning': '#ff0000',
  'Tropical Storm Warning': '#b22222',
}

function alertColor(event: string): string {
  return ALERT_COLORS[event] ?? '#aaaaaa'
}

const SPC_COLORS: Record<string, string> = {
  MRGL: '#006600', SLGT: '#339900', ENH: '#ddaa00',
  MDT: '#ff6600', HIGH: '#ff0000',
}

// Uses native L.tileLayer to guarantee maxNativeZoom:12 is applied —
// react-leaflet's TileLayer prop doesn't reliably set this on the Leaflet instance.
function RadarLayer({ host, frames, frameIdx }: { host: string; frames: { time: number; path: string }[]; frameIdx: number }) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

  useEffect(() => {
    const layer = L.tileLayer('', {
      opacity: 0.75,
      zIndex: 200,
      // RainViewer's public tier serves real radar tiles only up to z=7.
      // At z=8+ they return a "Zoom Level Not Supported" placeholder PNG
      // (1370 bytes, grayscale text) — verified by probing tile contents.
      // Cap maxNativeZoom at 7 so Leaflet upscales z=7 tiles for higher
      // zooms (chunky but always visible). For sharp high-zoom radar, use
      // the single-site NEXRAD layer (toggle ON) which serves up to z=12.
      maxNativeZoom: 7,
      maxZoom: 19,
      attribution: '',
    })
    layer.addTo(map)
    layerRef.current = layer
    return () => { layer.remove(); layerRef.current = null }
  }, [map])

  useEffect(() => {
    if (!frames.length || !layerRef.current) return
    const frame = frames[Math.min(frameIdx, frames.length - 1)]
    // 256px tiles to match Leaflet's default slippy-map coordinate scheme.
    // (512 needs tileSize+zoomOffset adjustments which we don't set.)
    layerRef.current.setUrl(`${host}${frame.path}/256/{z}/{x}/{y}/6/1_1.png`)
  }, [frames, frameIdx, host])

  return null
}

export default function RadarMap({
  mapRef, alerts, reports, center, aprsStations, hurricanes, watches, mesoscales,
  metars, showMetars, lsrs, cells, fires, quakes, showCells, showFires, showQuakes,
  spotters, showSpotters,
  nexrad, showMrms = false, showGlm = false, showPType = false, showProbSevere = false, showRangeRings, forceTimestamp,
}: Props) {
  const [radarData, setRadarData] = useState<RadarTimestamps | null>(null)
  const [spcOutlook, setSpcOutlook] = useState<unknown>(null)
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const allFrames = radarData
    ? [...(radarData.radar.past), ...(radarData.radar.nowcast)]
    : []

  useEffect(() => {
    const load = async () => {
      try {
        const [rd, sp] = await Promise.allSettled([
          fetchRadarTimestamps(), fetchSpcOutlookDay1()
        ])
        if (rd.status === 'fulfilled') {
          setRadarData(rd.value)
          setFrameIdx(rd.value.radar.past.length - 1)
        }
        if (sp.status === 'fulfilled') setSpcOutlook(sp.value)
      } catch (_) {}
    }
    load()
    const t = setInterval(load, 120_000)
    return () => clearInterval(t)
  }, [])

  // Time-machine override: when forceTimestamp is set, snap radar to the
  // past frame whose timestamp is closest, and stop auto-looping.
  useEffect(() => {
    if (forceTimestamp == null || !radarData?.radar.past?.length) return
    let bestIdx = 0
    let bestDelta = Infinity
    for (let i = 0; i < radarData.radar.past.length; i++) {
      const d = Math.abs(radarData.radar.past[i].time - forceTimestamp)
      if (d < bestDelta) { bestDelta = d; bestIdx = i }
    }
    setFrameIdx(bestIdx)
    setPlaying(false)
  }, [forceTimestamp, radarData])

  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current)
    // Don't auto-loop while in time-machine mode
    if (forceTimestamp != null) return
    if (!playing || allFrames.length === 0) return
    animRef.current = setInterval(() => {
      setFrameIdx((i) => (i + 1) % allFrames.length)
    }, speed)
    return () => { if (animRef.current) clearInterval(animRef.current) }
  }, [playing, allFrames.length, speed, forceTimestamp])

  const currentFrameTime = allFrames[frameIdx]
    ? new Date(allFrames[frameIdx].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  const isNowcast = frameIdx >= (radarData?.radar.past.length ?? 0)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={center}
        zoom={6}
        minZoom={3}
        maxZoom={14}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        attributionControl={true}
      >
        <MapRefCapture mapRef={mapRef} />
        <ScaleControl position="bottomright" imperial={true} metric={true} />

        {/* Radar rendered directly — bypasses react-leaflet's TileLayer to guarantee maxNativeZoom */}
        {radarData && <RadarLayer host={radarData.host} frames={allFrames} frameIdx={frameIdx} />}

        <LayersControl position="topright">
          {/* Base layers */}
          <LayersControl.BaseLayer checked name="🗺️ Dark">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              zIndex={1}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🛰️ Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri, Maxar, Earthstar Geographics"
              maxNativeZoom={19}
              zIndex={1}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="🗺️ Street">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              zIndex={1}
            />
          </LayersControl.BaseLayer>

          {/* NWS Alerts polygons */}
          <LayersControl.Overlay checked name="⚠ NWS Alerts">
            <>
              {(alerts?.features ?? [])
                .filter((f) => f.geometry)
                .map((f) => {
                  const color = alertColor(f.properties.event)
                  return (
                    <GeoJSON
                      key={f.properties.id}
                      data={f as unknown as GeoJSON.Feature}
                      style={{
                        color,
                        weight: 2,
                        fillColor: color,
                        fillOpacity: 0.12,
                      }}
                    >
                      <Popup>
                        <div style={{ maxWidth: 280, color: '#111' }}>
                          <strong style={{ fontSize: 13 }}>{f.properties.event}</strong>
                          <br />
                          <span style={{ fontSize: 11 }}>{f.properties.areaDesc}</span>
                          <br />
                          <small style={{ color: '#555' }}>{f.properties.headline}</small>
                        </div>
                      </Popup>
                    </GeoJSON>
                  )
                })}
            </>
          </LayersControl.Overlay>

          {/* SPC Outlook */}
          <LayersControl.Overlay checked name="🌪 SPC Outlook">
            <>
              {spcOutlook && (
                <GeoJSON
                  key="spc-day1"
                  data={spcOutlook as GeoJSON.GeoJsonObject}
                  style={(feature) => {
                    const label = feature?.properties?.LABEL as string ?? ''
                    const color = SPC_COLORS[label] ?? '#888'
                    return { color, weight: 1.5, fillColor: color, fillOpacity: 0.2 }
                  }}
                >
                  <Popup>
                    <span style={{ color: '#111' }}>SPC Day 1 Outlook</span>
                  </Popup>
                </GeoJSON>
              )}
            </>
          </LayersControl.Overlay>

          {/* Storm Reports */}
          <LayersControl.Overlay checked name="⚡ Storm Reports">
            <>
              {(reports?.tornado ?? []).map((r, i) => (
                <CircleMarker
                  key={`torn-${i}`}
                  center={[r.lat, r.lon]}
                  radius={8}
                  pathOptions={{ color: '#ff0000', fillColor: '#ff0000', fillOpacity: 0.85, weight: 2 }}
                >
                  <Popup>
                    <div style={{ color: '#111' }}>
                      <strong>🌪️ Tornado</strong> {r.magnitude && `EF${r.magnitude}`}<br />
                      {r.location}, {r.state}<br />
                      <small>{r.comment}</small>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
              {(reports?.hail ?? []).map((r, i) => (
                <CircleMarker
                  key={`hail-${i}`}
                  center={[r.lat, r.lon]}
                  radius={6}
                  pathOptions={{ color: '#00ccff', fillColor: '#00ccff', fillOpacity: 0.85, weight: 2 }}
                >
                  <Popup>
                    <div style={{ color: '#111' }}>
                      <strong>🧊 Hail</strong> {r.size}&quot;<br />
                      {r.location}, {r.state}<br />
                      <small>{r.comment}</small>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
              {(reports?.wind ?? []).map((r, i) => (
                <CircleMarker
                  key={`wind-${i}`}
                  center={[r.lat, r.lon]}
                  radius={5}
                  pathOptions={{ color: '#ffaa00', fillColor: '#ffaa00', fillOpacity: 0.8, weight: 1.5 }}
                >
                  <Popup>
                    <div style={{ color: '#111' }}>
                      <strong>💨 High Wind</strong> {r.speed && `${r.speed} mph`}<br />
                      {r.location}, {r.state}<br />
                      <small>{r.comment}</small>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </>
          </LayersControl.Overlay>
          {/* APRS Weather Stations */}
          <LayersControl.Overlay checked name="🌡 APRS Weather">
            <>
              {(aprsStations ?? []).map((s) => {
                const wx = s.weather
                return (
                  <CircleMarker
                    key={s.callsign}
                    center={[s.latitude, s.longitude]}
                    radius={7}
                    pathOptions={{ color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.85, weight: 1.5 }}
                  >
                    <Popup>
                      <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 160 }}>
                        <strong>🌡 {s.callsign}</strong>
                        <div style={{ marginTop: 4, fontSize: 11 }}>
                          {wx?.temp_f != null && <div>Temp: {wx.temp_f}°F</div>}
                          {wx?.humidity_pct != null && <div>Humidity: {wx.humidity_pct}%</div>}
                          {wx?.wind_gust_mph != null && (
                            <div>Gust: {wx.wind_gust_mph} mph{wx.wind_dir_deg != null ? ` @ ${wx.wind_dir_deg}°` : ''}</div>
                          )}
                          {wx?.wind_speed_mph != null && (
                            <div>Wind: {wx.wind_speed_mph} mph</div>
                          )}
                          {wx?.pressure_mbar != null && <div>Pressure: {wx.pressure_mbar} mb</div>}
                          {wx?.rain_1h_in != null && <div>Rain 1h: {wx.rain_1h_in}&quot;</div>}
                          {wx?.rain_24h_in != null && <div>Rain 24h: {wx.rain_24h_in}&quot;</div>}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </>
          </LayersControl.Overlay>
        </LayersControl>

        {/* Severe-weather overlays — always rendered when data is provided. */}
        <HazardLayers
          storms={hurricanes}
          watches={watches}
          mesoscales={mesoscales}
          metars={metars}
          showMetars={showMetars}
          lsrs={lsrs}
          cells={cells} showCells={showCells}
          fires={fires} showFires={showFires}
          quakes={quakes} showQuakes={showQuakes}
          spotters={spotters} showSpotters={showSpotters}
        />

        {/* Single-site NEXRAD overlay (optional) */}
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

        {/* MRMS CONUS composite reflectivity (optional) */}
        <MrmsLayer enabled={showMrms} refreshKey={nexrad?.refreshKey ?? 0} />

        {/* MRMS surface precip type — winter wx (optional) */}
        <PrecipTypeLayer enabled={showPType} refreshKey={nexrad?.refreshKey ?? 0} />

        {/* GOES-East GLM lightning flash extent density (optional) */}
        <GlmLayer enabled={showGlm} refreshKey={nexrad?.refreshKey ?? 0} />

        {/* ProbSevere v3 + ProbTor convective objects (optional) */}
        <ProbSevereLayer enabled={showProbSevere} />

        {showRangeRings && <RangeRings center={center} />}
      </MapContainer>

      {/* Radar animation controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(6,11,20,0.9)',
          border: '1px solid var(--border-bright)',
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backdropFilter: 'blur(4px)',
          minWidth: 340,
        }}
      >
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 5,
            background: playing ? 'var(--accent-cyan)' : 'var(--bg-card)',
            border: '1px solid var(--border-bright)',
            color: playing ? '#000' : 'var(--text-primary)',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
          title={playing ? 'Pause animation' : 'Play past radar + forecast projection'}
        >
          {playing ? '⏸ Pause' : '▶ Animate'}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, allFrames.length - 1)}
          value={frameIdx}
          onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)) }}
          style={{ flex: 1, accentColor: 'var(--accent-cyan)' }}
        />

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: isNowcast ? 'var(--warn-yellow)' : 'var(--accent-cyan)',
            minWidth: 70,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {isNowcast ? '▸ FCST ' + currentFrameTime : currentFrameTime}
        </div>

        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            fontSize: 10,
            padding: '1px 3px',
          }}
        >
          <option value={800}>0.5×</option>
          <option value={500}>1×</option>
          <option value={250}>2×</option>
          <option value={100}>4×</option>
        </select>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 1000,
          background: 'rgba(6,11,20,0.88)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 9px',
          fontSize: 10,
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(3px)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 4, letterSpacing: 1 }}>
          STORM REPORTS
        </div>
        {[['🔴', 'Tornado'], ['🔵', 'Large Hail'], ['🟡', 'High Wind']].map(([dot, label]) => (
          <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
            <span>{dot}</span><span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

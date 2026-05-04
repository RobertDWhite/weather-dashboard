/** Composable react-leaflet overlays that can be dropped into any MapContainer.
 * Renders hurricanes, SPC convective watches, mesoscale discussions, and METAR
 * mesh as togglable layers. Each one no-ops when its data is missing.
 */
import { useMemo } from 'react'
import { GeoJSON, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type {
  HurricaneStorm,
  LocalStormReport,
  MesoscaleDiscussion,
  MetarStation,
  Quake,
  SpcWatch,
  Spotter,
  StormCell,
  Wildfire,
} from '../types'

// ── Hurricane (NHC) overlays ────────────────────────────────────────

export function HurricanesLayer({ storms }: { storms: HurricaneStorm[] }) {
  if (!storms?.length) return null
  return (
    <>
      {storms.map((s) => (
        <SingleHurricane key={s.id} storm={s} />
      ))}
    </>
  )
}

function SingleHurricane({ storm }: { storm: HurricaneStorm }) {
  // Cone of uncertainty (white/semi-transparent)
  // Forecast track (dashed line)
  // Current position pin
  return (
    <>
      {storm.cone && (
        <GeoJSON
          key={`cone-${storm.id}`}
          data={storm.cone as GeoJSON.FeatureCollection}
          style={() => ({
            color: '#ffffff',
            weight: 1.5,
            fillColor: '#ffffff',
            fillOpacity: 0.18,
            opacity: 0.85,
            dashArray: '4 3',
          })}
        />
      )}
      {storm.track && (
        <GeoJSON
          key={`track-${storm.id}`}
          data={storm.track as GeoJSON.FeatureCollection}
          style={() => ({ color: '#ff2d55', weight: 2.5, opacity: 0.9 })}
        />
      )}
      {storm.latitude != null && storm.longitude != null && (
        <Marker
          position={[storm.latitude, storm.longitude]}
          icon={L.divIcon({
            html: `<div style="font-size:22px;line-height:1;text-shadow:0 0 6px #ff2d55,0 0 3px #000;">🌀</div>`,
            className: '',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -12],
          })}
        >
          <Popup>
            <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                🌀 {storm.classification ?? ''} {storm.name ?? storm.id}
              </div>
              {storm.intensity && <div style={{ fontSize: 12 }}>Intensity: <b>{storm.intensity}</b></div>}
              {storm.windSpeed && <div style={{ fontSize: 12 }}>Winds: <b>{storm.windSpeed}</b></div>}
              {storm.pressure && <div style={{ fontSize: 12 }}>Pressure: {storm.pressure} mb</div>}
              {storm.movement && <div style={{ fontSize: 11, color: '#444' }}>Movement: {storm.movement}</div>}
              {storm.lastUpdate && <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>Updated {storm.lastUpdate}</div>}
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                {storm.publicAdvisory && (
                  <a href={storm.publicAdvisory} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0078ff' }}>
                    Public Advisory
                  </a>
                )}
                {storm.discussion && (
                  <a href={storm.discussion} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0078ff' }}>
                    Discussion
                  </a>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  )
}

// ── SPC Convective Watch boxes ─────────────────────────────────────

export function WatchesLayer({ watches }: { watches: SpcWatch[] }) {
  if (!watches?.length) return null
  return (
    <>
      {watches.map((w, i) => {
        if (!w.geometry) return null
        const isTor = (w.type || '').toLowerCase().includes('tornado')
        const color = w.is_pds ? '#ff00ff' : isTor ? '#ff2d55' : '#ffd60a'
        return (
          <GeoJSON
            key={`watch-${w.ww}-${i}`}
            data={w.geometry as GeoJSON.Geometry}
            style={() => ({
              color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.08,
              dashArray: '8 4',
              opacity: 0.85,
            })}
            eventHandlers={{
              add: (e) => {
                const layer = e.target as L.GeoJSON
                layer.bindPopup(
                  `<div style="color:#111;font-family:system-ui,sans-serif;min-width:180px">
                    <div style="font-weight:800;font-size:13px">
                      ${w.is_pds ? '<span style="color:#ff00ff">⚠ PDS</span> ' : ''}
                      ${w.type ?? 'Watch'} #${w.ww ?? ''}
                    </div>
                    ${w.expires ? `<div style="font-size:11px;color:#444">Until ${new Date(w.expires).toLocaleString()}</div>` : ''}
                    ${w.tornado_prob != null ? `<div style="font-size:11px">Tornado prob: ${w.tornado_prob}</div>` : ''}
                    ${w.max_hail_in != null ? `<div style="font-size:11px">Max hail: ${w.max_hail_in}"</div>` : ''}
                    ${w.max_wind_kt != null ? `<div style="font-size:11px">Max wind: ${w.max_wind_kt} kt</div>` : ''}
                    ${w.raw_text_url ? `<a href="${w.raw_text_url}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#0078ff">Watch Text</a>` : ''}
                  </div>`,
                )
              },
            }}
          />
        )
      })}
    </>
  )
}

// ── Mesoscale Discussion polygons ──────────────────────────────────

export function MesoscalesLayer({ items }: { items: MesoscaleDiscussion[] }) {
  if (!items?.length) return null
  return (
    <>
      {items
        .filter((it) => it.geometry)
        .map((it) => (
          <GeoJSON
            key={`md-${it.md_num}`}
            data={it.geometry as GeoJSON.FeatureCollection}
            style={() => ({
              color: '#22d3ee',
              weight: 1.8,
              fillColor: '#22d3ee',
              fillOpacity: 0.06,
              dashArray: '2 4',
              opacity: 0.7,
            })}
            eventHandlers={{
              add: (e) => {
                const layer = e.target as L.GeoJSON
                layer.bindPopup(
                  `<div style="color:#111;font-family:system-ui,sans-serif;max-width:300px">
                    <div style="font-weight:800;font-size:12px;margin-bottom:4px">
                      📝 SPC Mesoscale Discussion ${it.md_num ?? ''}
                    </div>
                    <div style="font-size:11px;color:#333;line-height:1.4">${(it.title ?? '').slice(0, 200)}</div>
                    ${it.link ? `<a href="${it.link}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#0078ff;display:inline-block;margin-top:6px">Read MD ${it.md_num}</a>` : ''}
                  </div>`,
                )
              },
            }}
          />
        ))}
    </>
  )
}

// ── METAR mesh (station model lite) ─────────────────────────────────

const FLIGHT_CAT_COLOR: Record<MetarStation['flight_category'], string> = {
  VFR: '#22c55e',
  MVFR: '#3b82f6',
  IFR: '#ef4444',
  LIFR: '#a855f7',
}

function windBarbHtml(speedKt: number | null, dirDeg: number | null, color: string) {
  if (speedKt == null) {
    return `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:1px solid #fff8"></div>`
  }
  const len = 16
  const rot = dirDeg ?? 0
  return `
    <div style="position:relative;width:${len * 2}px;height:${len * 2}px;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;width:8px;height:8px;border-radius:50%;background:${color};border:1px solid #fff8"></div>
      <div style="position:absolute;width:1.5px;height:${len}px;background:${color};transform:rotate(${rot}deg) translateY(-${len / 2}px);transform-origin:center top"></div>
    </div>`
}

export function MetarMeshLayer({
  stations,
  showText = true,
}: {
  stations: MetarStation[]
  showText?: boolean
}) {
  const items = useMemo(() => stations.filter((s) => s.lat != null && s.lon != null), [stations])
  if (!items.length) return null
  return (
    <>
      {items.map((m) => {
        const color = FLIGHT_CAT_COLOR[m.flight_category] ?? '#9ca3af'
        const labelHtml = showText && m.temp_f != null
          ? `<div style="position:absolute;left:14px;top:-8px;font:600 10px system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000;white-space:nowrap">${Math.round(m.temp_f)}</div>`
          : ''
        const dewHtml = showText && m.dewpoint_f != null
          ? `<div style="position:absolute;left:14px;top:6px;font:600 9px system-ui,sans-serif;color:#86efac;text-shadow:0 0 3px #000;white-space:nowrap">${Math.round(m.dewpoint_f)}</div>`
          : ''
        return (
          <Marker
            key={m.station_id}
            position={[m.lat, m.lon]}
            icon={L.divIcon({
              html: `<div style="position:relative">${windBarbHtml(m.wind_speed_kt, m.wind_dir_deg, color)}${labelHtml}${dewHtml}</div>`,
              className: '',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -8],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 180 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {m.station_id} <span style={{ color: FLIGHT_CAT_COLOR[m.flight_category], fontSize: 10 }}>
                    [{m.flight_category}]
                  </span>
                </div>
                {m.name && <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{m.name}</div>}
                {m.temp_f != null && (
                  <div style={{ fontSize: 12 }}>
                    {Math.round(m.temp_f)}°F / {Math.round((m.temp_c ?? 0))}°C
                    {m.dewpoint_f != null && <span style={{ color: '#0a8' }}> · DP {Math.round(m.dewpoint_f)}°F</span>}
                  </div>
                )}
                {m.wind_speed_kt != null && (
                  <div style={{ fontSize: 12 }}>
                    Wind {m.wind_dir_deg ?? 'VRB'}° @ {m.wind_speed_kt} kt
                    {m.wind_gust_kt ? ` G${m.wind_gust_kt}` : ''}
                  </div>
                )}
                {m.visibility_mi != null && <div style={{ fontSize: 11 }}>Vis {m.visibility_mi} mi</div>}
                {m.altimeter_hpa != null && <div style={{ fontSize: 11 }}>Alt {m.altimeter_hpa} hPa</div>}
                {m.wx_string && <div style={{ fontSize: 11, fontStyle: 'italic' }}>{m.wx_string}</div>}
                {m.raw_metar && (
                  <div style={{ fontSize: 9, color: '#777', marginTop: 4, fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all' }}>
                    {m.raw_metar}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── NWS Local Storm Reports (live spotter feed) ─────────────────────

const LSR_COLOR: Record<LocalStormReport['category'], string> = {
  tornado: '#ef4444',
  hail: '#3b82f6',
  wind: '#f59e0b',
  flood: '#22c55e',
  lightning: '#facc15',
  winter: '#a855f7',
  fire: '#dc2626',
  other: '#94a3b8',
}
const LSR_EMOJI: Record<LocalStormReport['category'], string> = {
  tornado: '🌪',
  hail: '🧊',
  wind: '💨',
  flood: '🌊',
  lightning: '⚡',
  winter: '❄️',
  fire: '🔥',
  other: '•',
}

export function LsrLayer({ items }: { items: LocalStormReport[] }) {
  if (!items?.length) return null
  return (
    <>
      {items.map((r, i) => {
        const color = LSR_COLOR[r.category]
        return (
          <Marker
            key={`lsr-${i}-${r.valid}`}
            position={[r.lat, r.lon]}
            icon={L.divIcon({
              html: `<div style="font-size:16px;line-height:1;text-shadow:0 0 4px ${color},0 0 2px #000">${LSR_EMOJI[r.category]}</div>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              popupAnchor: [0, -8],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 200, maxWidth: 280 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color }}>
                  {LSR_EMOJI[r.category]} {r.type}
                  {r.magnitude != null && r.magnitude !== '' && (
                    <span style={{ marginLeft: 6, color: '#000' }}>{String(r.magnitude)}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
                  {r.city}, {r.state}{r.county ? ` (${r.county})` : ''}
                </div>
                <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
                  {r.valid ? new Date(r.valid).toLocaleTimeString() : ''}
                  {r.wfo ? ` · WFO ${r.wfo}` : ''}
                  {r.source ? ` · ${r.source}` : ''}
                </div>
                {r.remark && (
                  <div style={{ fontSize: 11, color: '#222', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                    {r.remark}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── Storm cells (radar attribute table) ─────────────────────────────

export function StormCellsLayer({ cells }: { cells: StormCell[] }) {
  if (!cells?.length) return null
  return (
    <>
      {cells.map((c, i) => {
        const sig = c.tvs === 'TVS' ? 'TVS' : c.meso ? 'MESO' : null
        const color = sig === 'TVS' ? '#ef4444' : sig === 'MESO' ? '#facc15' : '#94a3b8'
        const dbz = c.max_dbz ?? 0
        const alpha = Math.min(1, Math.max(0.4, (dbz - 30) / 30))
        const ring = 6 + Math.min(12, (dbz - 35) / 3)
        // Motion arrow: drct in degrees (FROM), sknt in knots
        const arrowDeg = c.drct != null ? (c.drct + 180) % 360 : null
        return (
          <Marker
            key={`cell-${i}-${c.storm_id}`}
            position={[c.lat, c.lon]}
            icon={L.divIcon({
              html: `
                <div style="position:relative;width:${ring * 2}px;height:${ring * 2}px;display:flex;align-items:center;justify-content:center">
                  <div style="position:absolute;inset:0;border:2px solid ${color};border-radius:50%;opacity:${alpha}"></div>
                  ${sig ? `<div style="font-size:8px;font-weight:800;color:${color};text-shadow:0 0 2px #000">${sig}</div>` : ''}
                  ${arrowDeg != null ? `<div style="position:absolute;width:1.5px;height:${10 + (c.sknt ?? 0) / 4}px;background:${color};transform:rotate(${arrowDeg}deg) translateY(-${(10 + (c.sknt ?? 0) / 4) / 2}px);transform-origin:center top;opacity:${alpha}"></div>` : ''}
                </div>
              `,
              className: '',
              iconSize: [ring * 2, ring * 2],
              iconAnchor: [ring, ring],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color }}>
                  Cell {c.storm_id} {sig ? `· ${sig}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
                  Max dBZ: <b>{c.max_dbz ?? '—'}</b> @ {c.max_dbz_height_kft ?? '—'} kft
                </div>
                {c.top_kft != null && <div style={{ fontSize: 11 }}>Top: {c.top_kft} kft</div>}
                {c.vil != null && <div style={{ fontSize: 11 }}>VIL: {c.vil}</div>}
                {(c.drct != null || c.sknt != null) && (
                  <div style={{ fontSize: 11 }}>
                    Motion: from {c.drct}° at {c.sknt} kt
                  </div>
                )}
                {(c.poh != null || c.posh != null) && (
                  <div style={{ fontSize: 11 }}>
                    POH {c.poh ?? '—'}% · POSH {c.posh ?? '—'}%
                    {c.max_size_in != null && ` · max ${c.max_size_in}"`}
                  </div>
                )}
                {c.nexrad && <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>radar {c.nexrad}</div>}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── Wildfires (NIFC) ──────────────────────────────────────────────

export function WildfiresLayer({ fires }: { fires: Wildfire[] }) {
  if (!fires?.length) return null
  return (
    <>
      {fires.map((f, i) => {
        const acres = f.acres ?? 0
        const size = acres > 10000 ? 18 : acres > 1000 ? 14 : 11
        return (
          <Marker
            key={`fire-${i}-${f.name}`}
            position={[f.lat, f.lon]}
            icon={L.divIcon({
              html: `<div style="font-size:${size}px;line-height:1;text-shadow:0 0 4px #dc2626,0 0 2px #000">🔥</div>`,
              className: '',
              iconSize: [size + 4, size + 4],
              iconAnchor: [(size + 4) / 2, (size + 4) / 2],
              popupAnchor: [0, -8],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#dc2626' }}>
                  🔥 {f.name || 'Unnamed fire'}
                </div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
                  {f.acres != null && <>Size: <b>{Math.round(f.acres).toLocaleString()} acres</b><br /></>}
                  {f.type && <>Type: {f.type}<br /></>}
                  {f.cause && <>Cause: {f.cause}<br /></>}
                  {f.state && <>State: {f.state}</>}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── Earthquakes (USGS) ────────────────────────────────────────────

export function QuakesLayer({ quakes }: { quakes: Quake[] }) {
  if (!quakes?.length) return null
  return (
    <>
      {quakes.map((q, i) => {
        const mag = q.mag ?? 2.5
        const radius = Math.max(5, 3 + mag * 2)
        const color = mag >= 7 ? '#7f1d1d' : mag >= 5 ? '#ef4444' : mag >= 3.5 ? '#f97316' : '#facc15'
        return (
          <Marker
            key={`qk-${i}-${q.time_ms}`}
            position={[q.lat, q.lon]}
            icon={L.divIcon({
              html: `<div style="width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;background:${color}55;border:1.5px solid ${color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;text-shadow:0 0 2px #000;font-family:system-ui">${mag.toFixed(1)}</div>`,
              className: '',
              iconSize: [radius * 2, radius * 2],
              iconAnchor: [radius, radius],
              popupAnchor: [0, -radius],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color }}>
                  M{(q.mag ?? 0).toFixed(1)} {q.type ?? 'earthquake'}
                </div>
                <div style={{ fontSize: 11 }}>{q.place}</div>
                {q.depth_km != null && <div style={{ fontSize: 11 }}>Depth: {q.depth_km.toFixed(1)} km</div>}
                {q.felt && <div style={{ fontSize: 11 }}>Felt reports: {q.felt}</div>}
                {q.tsunami ? <div style={{ fontSize: 11, color: '#dc2626' }}>⚠ Tsunami flag</div> : null}
                {q.url && <a href={q.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0078ff', display: 'inline-block', marginTop: 4 }}>USGS detail →</a>}
                {q.time_ms && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{new Date(q.time_ms).toLocaleString()}</div>}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// ── Spotter Network ───────────────────────────────────────────────

export function SpottersLayer({ spotters }: { spotters: Spotter[] }) {
  if (!spotters?.length) return null
  return (
    <>
      {spotters.map((s, i) => {
        const moving = (s.motion || '').toUpperCase() === 'MOVING'
        const color = moving ? '#fbbf24' : '#22d3ee'
        const dir = s.direction_deg ?? 0
        const arrow = moving
          ? `<div style="position:absolute;width:1.5px;height:14px;background:${color};transform:rotate(${dir}deg) translateY(-7px);transform-origin:center top"></div>`
          : ''
        const label = (s.callsign || '').slice(0, 14).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        return (
          <Marker
            key={`sn-${i}-${s.lat.toFixed(3)}-${s.lon.toFixed(3)}`}
            position={[s.lat, s.lon]}
            icon={L.divIcon({
              html: `
                <div style="position:relative;width:18px;height:18px;display:flex;align-items:center;justify-content:center">
                  <div style="position:absolute;inset:0;border-radius:50%;background:${color}33;border:1.5px solid ${color}"></div>
                  ${arrow}
                  <div style="position:absolute;left:11px;top:-2px;font:600 9px system-ui;color:#fff;text-shadow:0 0 2px #000;white-space:nowrap;pointer-events:none">${label}</div>
                </div>
              `,
              className: '',
              iconSize: [22, 22],
              iconAnchor: [11, 11],
              popupAnchor: [0, -10],
            })}
          >
            <Popup>
              <div style={{ color: '#111', fontFamily: 'system-ui,sans-serif', minWidth: 180 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color }}>
                  📡 {s.callsign || 'Spotter'}
                </div>
                {s.motion && (
                  <div style={{ fontSize: 11, color: moving ? '#a16207' : '#444', fontWeight: 700 }}>
                    {s.motion}{moving && s.direction_deg != null ? ` @ ${s.direction_deg}°` : ''}
                  </div>
                )}
                {s.last_seen && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{s.last_seen}</div>}
                {s.web && (
                  <a href={s.web} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0078ff', display: 'inline-block', marginTop: 4 }}>
                    Live feed →
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// Re-export so RadarMap can grab named or default if it ever wants to:
export default function HazardLayers(props: {
  storms?: HurricaneStorm[]
  watches?: SpcWatch[]
  mesoscales?: MesoscaleDiscussion[]
  metars?: MetarStation[]
  lsrs?: LocalStormReport[]
  cells?: StormCell[]
  fires?: Wildfire[]
  quakes?: Quake[]
  spotters?: Spotter[]
  showHurricanes?: boolean
  showWatches?: boolean
  showMesoscales?: boolean
  showMetars?: boolean
  showLsrs?: boolean
  showCells?: boolean
  showFires?: boolean
  showQuakes?: boolean
  showSpotters?: boolean
}) {
  return (
    <>
      {props.showWatches !== false && <WatchesLayer watches={props.watches ?? []} />}
      {props.showMesoscales !== false && <MesoscalesLayer items={props.mesoscales ?? []} />}
      {props.showHurricanes !== false && <HurricanesLayer storms={props.storms ?? []} />}
      {props.showLsrs !== false && <LsrLayer items={props.lsrs ?? []} />}
      {props.showCells && <StormCellsLayer cells={props.cells ?? []} />}
      {props.showFires && <WildfiresLayer fires={props.fires ?? []} />}
      {props.showQuakes && <QuakesLayer quakes={props.quakes ?? []} />}
      {props.showSpotters && <SpottersLayer spotters={props.spotters ?? []} />}
      {props.showMetars && <MetarMeshLayer stations={props.metars ?? []} />}
    </>
  )
}


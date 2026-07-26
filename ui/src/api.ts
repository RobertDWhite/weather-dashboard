import type {
  ActiveStormsResponse,
  AppConfig,
  AprsResponse,
  AqiCurrent,
  BriefingResponse,
  Camera,
  CurrentConditions,
  GoesUrls,
  HealthResponse,
  HrrrForecastResponse,
  LightningResponse,
  PrioritizeResponse,
  SpottersResponse,
  LsrResponse,
  MesoanalysisCatalog,
  MesoscaleDiscussionsResponse,
  MetarMeshResponse,
  NexradSitesResponse,
  NexradTimestampResponse,
  NwsTextProduct,
  NWSAlertsResponse,
  OhgoCamera,
  QuakesResponse,
  RadarTimestamps,
  RiverGauge,
  SpcWatchesResponse,
  StormCellsResponse,
  StormReports,
  TimeMachineListResponse,
  TimeMachineSnapshot,
  TropicalOutlookResponse,
  WildfiresResponse,
  YouTubeLive,
} from './types'

const BASE = '/api'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { signal })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`)
  return r.json() as Promise<T>
}

export const fetchConfig = (s?: AbortSignal) => get<AppConfig>('/config', s)

export const fetchCurrent = (s?: AbortSignal) =>
  get<CurrentConditions>('/openmeteo/current', s)

export const fetchForecast = (s?: AbortSignal) =>
  get<{ hourly: object[]; daily: object[]; timezone: string }>('/openmeteo/forecast', s)

export const fetchAlerts = (s?: AbortSignal) =>
  get<NWSAlertsResponse>('/nws/alerts', s)

/** Alerts intersecting the deployment's observer area. The map still uses the
 * unfiltered feed; threat banners and summaries use this local feed. */
export const fetchLocalAlerts = (s?: AbortSignal) =>
  get<NWSAlertsResponse>('/nws/alerts?local=true', s)

export const fetchNwsForecast = (s?: AbortSignal) =>
  get<{ periods: object[]; wfo: string; timezone: string }>('/nws/forecast', s)

export const fetchRadarTimestamps = (s?: AbortSignal) =>
  get<RadarTimestamps>('/radar/timestamps', s)

export const fetchSpcOutlookDay1 = (s?: AbortSignal) =>
  get<object>('/spc/outlook/day1', s)

export const fetchSpcOutlookDay1Tornado = (s?: AbortSignal) =>
  get<object>('/spc/outlook/day1/tornado', s)

export const fetchSpcOutlookDay2 = (s?: AbortSignal) =>
  get<object>('/spc/outlook/day2', s)

export const fetchStormReports = (s?: AbortSignal) =>
  get<StormReports>('/spc/reports', s)

export const fetchGoesUrls = (s?: AbortSignal) =>
  get<GoesUrls>('/satellite/goes', s)

export const fetchRiverGauges = (state?: string, s?: AbortSignal) =>
  get<{ gauges: RiverGauge[]; state: string }>(
    `/usgs/gauges${state ? `?state=${state}` : ''}`,
    s,
  )

export const fetchCameras = (lat: number, lon: number, radiusMiles = 80, s?: AbortSignal) =>
  get<Camera[]>(`/cameras/nearby?lat=${lat}&lon=${lon}&radius=${radiusMiles}`, s)

export const fetchOhgoCameras = (lat: number, lon: number, radiusMiles = 50, s?: AbortSignal) =>
  get<OhgoCamera[]>(`/ohgo/nearby?lat=${lat}&lon=${lon}&radius=${radiusMiles}`, s)

export const fetchAprsStations = (s?: AbortSignal) =>
  get<AprsResponse>('/aprs/stations', s)

export const fetchZoneGeometries = (zonePaths: string[], s?: AbortSignal) =>
  get<Record<string, GeoJSON.Geometry>>(`/nws/zone-geometries?ids=${zonePaths.map(encodeURIComponent).join(',')}`, s)

export const fetchPinnedLive = (s?: AbortSignal) =>
  get<YouTubeLive[]>('/youtube/pinned-live', s)

export const fetchYouTubeLive = (
  opts: { lat?: number; lon?: number; radius?: string; q?: string },
  s?: AbortSignal,
) => {
  const p = new URLSearchParams()
  if (opts.lat != null) p.set('lat', String(opts.lat))
  if (opts.lon != null) p.set('lon', String(opts.lon))
  if (opts.radius) p.set('radius', opts.radius)
  if (opts.q) p.set('q', opts.q)
  return get<YouTubeLive[]>(`/youtube/live?${p}`, s)
}

// ── Severe-weather operations endpoints ────────────────────────────

export const fetchActiveStorms = (s?: AbortSignal) =>
  get<ActiveStormsResponse>('/nhc/active', s)

export const fetchSpcWatches = (s?: AbortSignal) =>
  get<SpcWatchesResponse>('/spc/watches', s)

export const fetchMesoscale = (s?: AbortSignal) =>
  get<MesoscaleDiscussionsResponse>('/spc/mesoscale/json', s)

export const fetchMesoanalysisCatalog = (s?: AbortSignal) =>
  get<MesoanalysisCatalog>('/mesoanalysis/catalog', s)

export const fetchMetarMesh = (
  opts: { lat?: number; lon?: number; radius_km?: number; limit?: number } = {},
  s?: AbortSignal,
) => {
  const p = new URLSearchParams()
  if (opts.lat != null) p.set('lat', String(opts.lat))
  if (opts.lon != null) p.set('lon', String(opts.lon))
  if (opts.radius_km != null) p.set('radius_km', String(opts.radius_km))
  if (opts.limit != null) p.set('limit', String(opts.limit))
  return get<MetarMeshResponse>(`/metars/mesh${p.toString() ? `?${p}` : ''}`, s)
}

export const fetchHealth = (s?: AbortSignal) =>
  get<HealthResponse>('/health/upstreams', s)

export const fetchLsrs = (hours = 2, s?: AbortSignal) =>
  get<LsrResponse>(`/lsr/recent?hours=${hours}`, s)

export const fetchNexradSites = (lat?: number, lon?: number, s?: AbortSignal) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<NexradSitesResponse>(`/nexrad/sites${p.toString() ? `?${p}` : ''}`, s)
}

export const fetchNexradTimestamp = (site: string, product: string, s?: AbortSignal) =>
  get<NexradTimestampResponse>(`/nexrad/timestamp?site=${site}&product=${product}`, s)

// NWS text products (AFD / HWO / SPC discussion)
export const fetchAfd = (lat?: number, lon?: number, s?: AbortSignal) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<NwsTextProduct>(`/text/afd${p.toString() ? `?${p}` : ''}`, s)
}
export const fetchHwo = (lat?: number, lon?: number, s?: AbortSignal) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<NwsTextProduct>(`/text/hwo${p.toString() ? `?${p}` : ''}`, s)
}
export const fetchSpcDiscussion = (s?: AbortSignal) =>
  get<NwsTextProduct>('/text/spc-discussion', s)

export const fetchTropicalOutlook = (s?: AbortSignal) =>
  get<TropicalOutlookResponse>('/nhc/two', s)

export const fetchAqi = (lat?: number, lon?: number, s?: AbortSignal) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<AqiCurrent>(`/airnow/current${p.toString() ? `?${p}` : ''}`, s)
}

export const fetchHrrrForecast = (hours = 12, s?: AbortSignal) =>
  get<HrrrForecastResponse>(`/hrrr/forecast?hours=${hours}`, s)

export const fetchHrrrSmoke = (hours = 12, s?: AbortSignal) =>
  get<HrrrForecastResponse>(`/hrrr/smoke?hours=${hours}`, s)

// AI briefing + status
export const fetchBriefing = (s?: AbortSignal) =>
  get<BriefingResponse>('/briefing/now', s)
export const fetchBriefingStatus = (s?: AbortSignal) =>
  get<{ ok: boolean; available_models?: string[]; configured_model?: string }>('/briefing/status', s)

// Time machine
export const fetchTimeMachineList = (hours = 6, s?: AbortSignal) =>
  get<TimeMachineListResponse>(`/timemachine/snapshots?hours=${hours}`, s)
export const fetchTimeMachineAt = (ts: number, s?: AbortSignal) =>
  get<TimeMachineSnapshot>(`/timemachine/at?ts=${ts}`, s)

// Storm cells / wildfires / earthquakes / lightning
export const fetchStormCells = (s?: AbortSignal) =>
  get<StormCellsResponse>('/cells/active', s)
export const fetchWildfires = (s?: AbortSignal) =>
  get<WildfiresResponse>('/wildfire/active', s)
export const fetchQuakes = (period: '1h' | '1d' | '7d' = '1d', s?: AbortSignal) =>
  get<QuakesResponse>(`/earthquakes/recent?period=${period}`, s)
export const fetchLightning = (lat?: number, lon?: number, s?: AbortSignal) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<LightningResponse>(`/lightning/potential${p.toString() ? `?${p}` : ''}`, s)
}

export const fetchSpotters = (s?: AbortSignal) =>
  get<SpottersResponse>('/spotters/active', s)

// Aviation
export const fetchTafs = (lat?: number, lon?: number) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<{ tafs: import('./types').TafEntry[]; count: number }>(`/aviation/tafs${p.toString() ? `?${p}` : ''}`)
}
export const fetchPireps = (lat?: number, lon?: number) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<{ pireps: import('./types').PirepEntry[]; count: number }>(`/aviation/pireps${p.toString() ? `?${p}` : ''}`)
}
export const fetchSigmets = () => get<{ sigmets: unknown[]; count: number }>('/aviation/sigmets')
export const fetchAirmets = () => get<{ airmets: unknown[]; count: number }>('/aviation/airmets')

// NWS zones
export const fetchNwsZones = (layer: 'cwa' | 'fire' | 'public' | 'marine') =>
  get<GeoJSON.FeatureCollection>(`/nws_zones/${layer}`)

// Marine
export const fetchBuoys = (lat?: number, lon?: number) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<{ buoys: import('./types').BuoyEntry[] }>(`/marine/buoys${p.toString() ? `?${p}` : ''}`)
}
export const fetchTides = (lat?: number, lon?: number) => {
  const p = new URLSearchParams()
  if (lat != null) p.set('lat', String(lat))
  if (lon != null) p.set('lon', String(lon))
  return get<{ tides: import('./types').TideEntry[] }>(`/marine/tides${p.toString() ? `?${p}` : ''}`)
}

// Damage paths + hazards + verification + cell tracks
export const fetchDamage = (days = 7) =>
  get<{ tracks: GeoJSON.FeatureCollection; count: number; days: number }>(`/damage/recent?days=${days}`)
export const fetchHazardsAll = () => get<GeoJSON.FeatureCollection>('/hazards/all')
export const fetchVerification = () => get<import('./types').VerificationResponse>('/verification/today')
export const fetchCellTracks = () => get<{ tracks: import('./types').CellTrack[]; count: number }>('/cell_tracks/recent')

// Web push
export const fetchWebPushKey = () => get<import('./types').WebPushKey>('/webpush/key')
export const fetchWebPushStatus = () => get<{ ready: boolean; subscribers: number }>('/webpush/status')
export async function postPushSubscribe(sub: PushSubscription, ua?: string) {
  const r = await fetch(`/api/webpush/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sub.toJSON(), user_agent: ua }),
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<{ subscribed: boolean }>
}
export async function postPushUnsubscribe(endpoint: string) {
  const r = await fetch(`/api/webpush/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<{ unsubscribed: boolean }>
}
export async function postPushTest() {
  const r = await fetch(`/api/webpush/test`, { method: 'POST' })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<{ sent: number }>
}

export async function postPrioritize(
  alerts: Array<{
    id: string
    event?: string | null
    severity?: string | null
    headline?: string | null
    areaDesc?: string | null
    expires?: string | null
  }>,
  signal?: AbortSignal,
): Promise<PrioritizeResponse> {
  const r = await fetch(`/api/briefing/prioritize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alerts }),
    signal,
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<PrioritizeResponse>
}

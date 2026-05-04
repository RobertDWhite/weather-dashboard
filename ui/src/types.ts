export interface AppConfig {
  lat: number
  lon: number
  location: string
  state: string
  hasOwmKey: boolean
  hasAirnowKey: boolean
  hasWebhook?: boolean
  apiVersion?: string
  apiBuiltAt?: string
}

// Build-time constants injected by Vite (see vite.config.ts)
declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string
  // eslint-disable-next-line no-var
  var __BUILD_TIME__: string
}

export interface CurrentConditions {
  temperature: number
  feelsLike: number
  dewPoint: number | null
  humidity: number
  precipitation: number
  weatherCode: number
  condition: string
  icon: string
  cloudCover: number
  windSpeed: number
  windDirection: number
  windGusts: number
  pressure: number
  visibility: number
  isDay: number
  time: string
  timezone: string
}

export interface HourlyPeriod {
  time: string
  temperature: number
  dewPoint: number
  feelsLike: number
  precipProbability: number
  precipitation: number
  weatherCode: number
  condition: string
  icon: string
  windSpeed: number
  windDirection: number
  windGusts: number
  cloudCover: number
  visibility: number
}

export interface DailyPeriod {
  date: string
  tempMax: number
  tempMin: number
  feelsMax: number
  feelsMin: number
  precipSum: number
  precipProbability: number
  windMax: number
  windGusts: number
  windDir: number
  sunrise: string
  sunset: string
  uvIndex: number
  weatherCode: number
  condition: string
  icon: string
}

export interface NWSPeriod {
  number: number
  name: string
  startTime: string
  endTime: string
  isDaytime: boolean
  temperature: number
  temperatureUnit: string
  windSpeed: string
  windDirection: string
  shortForecast: string
  detailedForecast: string
  icon: string
  probabilityOfPrecipitation?: { value: number | null }
}

export interface NWSAlert {
  properties: {
    id: string
    event: string
    severity: string
    urgency: string
    certainty: string
    headline: string
    description: string
    instruction: string
    areaDesc: string
    effective: string
    expires: string
    ends: string
    sent: string
    onset: string
    status: string
    messageType: string
    senderName: string
    parameters?: Record<string, string[]>
  }
  geometry: {
    type: string
    coordinates: number[][][] | number[][][][]
  } | null
  id: string
  type: string
}

export interface NWSAlertsResponse {
  features: NWSAlert[]
  updated: string
  type: string
}

export interface StormReport {
  time: string
  location: string
  county: string
  state: string
  lat: number
  lon: number
  comment: string
  magnitude?: string
  size?: string
  speed?: string
}

export interface StormReports {
  tornado: StormReport[]
  hail: StormReport[]
  wind: StormReport[]
  total: number
  generated: string
}

export interface RadarFrame {
  time: number
  path: string
}

export interface RadarTimestamps {
  host: string
  generated: number
  radar: {
    past: RadarFrame[]
    nowcast: RadarFrame[]
  }
  satellite: {
    infrared: RadarFrame[]
  }
}

export interface RiverGauge {
  siteCode: string
  siteName: string
  lat: number
  lon: number
  height: number
  unit: string
  time: string
  qualifiers: string[]
}

export interface YouTubeLive {
  id: string
  title: string
  channel: string
  description: string
  thumbnail: string | null
  published_at: string
  watch_url: string
  embed_url: string
}

export interface OhgoCamera {
  id: string
  title: string
  direction: string
  lat: number
  lon: number
  image_url: string | null
  thumbnail_url: string | null
  source: 'OHGO'
  distance_miles: number
}

export interface Camera {
  id: string | number
  title: string
  lat: number | null
  lon: number | null
  city: string
  country: string
  preview: string | null
  thumbnail: string | null
  player_url: string | null
  embed_url: string | null
}

export interface AprsWeather {
  temp_f?: number
  humidity_pct?: number
  wind_speed_mph?: number
  wind_gust_mph?: number
  wind_dir_deg?: number
  rain_1h_in?: number
  rain_24h_in?: number
  pressure_mbar?: number
}

export interface AprsStation {
  callsign: string
  latitude: number
  longitude: number
  is_weather: boolean
  weather: AprsWeather | null
  last_heard: string
  comment: string | null
  speed_kt: number | null
  course: number | null
  altitude_ft: number | null
  frequency_hz: number | null
}

export interface GoesUrls {
  generated: number
  GOES16: {
    CONUS: Record<string, string>
    FULL_DISK: Record<string, string>
  }
  GOES18: {
    CONUS: Record<string, string>
  }
  channels: Record<string, string>
}

// ── Hurricane / NHC ─────────────────────────────────────────────────

export interface HurricaneStorm {
  id: string
  binNumber: string | null
  name: string | null
  classification: string | null
  intensity: string | null
  pressure: string | null
  latitude: number | null
  longitude: number | null
  movement: string | null
  lastUpdate: string | null
  publicAdvisory: string | null
  discussion: string | null
  windSpeed: string | null
  cone: GeoJSON.FeatureCollection | null
  track: GeoJSON.FeatureCollection | null
  position: GeoJSON.FeatureCollection | null
}

export interface ActiveStormsResponse {
  storms: HurricaneStorm[]
  fetched: string | null
}

// ── SPC Watches (convective watch boxes) ────────────────────────────

export interface SpcWatch {
  ww: string | number | null
  type: string | null            // "Tornado Watch" | "Severe Thunderstorm Watch"
  issued: string | null
  expires: string | null
  is_pds: boolean
  max_hail_in: number | string | null
  max_wind_kt: number | string | null
  tornado_prob: number | string | null
  raw_text_url: string | null
  headline?: string | null
  wfo?: string | null
  geometry: GeoJSON.Geometry | null
}

export interface SpcWatchesResponse {
  watches: SpcWatch[]
  count: number
  raw_html?: string
}

// ── Mesoscale Discussions ────────────────────────────────────────────

export interface MesoscaleDiscussion {
  title: string | null
  link: string
  pub_date: string | null
  description: string | null
  md_num: string | null
  geometry: GeoJSON.FeatureCollection | null
}

export interface MesoscaleDiscussionsResponse {
  items: MesoscaleDiscussion[]
  count: number
}

// ── Mesoanalysis catalog ─────────────────────────────────────────────

export interface MesoanalysisParam {
  code: string
  label: string
  urls: Record<string, string>  // sector → image URL
}

export interface MesoanalysisGroup {
  name: string
  params: MesoanalysisParam[]
}

export interface MesoanalysisCatalog {
  sectors: Record<string, { label: string; code: string }>
  groups: MesoanalysisGroup[]
  attribution: string
  page: string
}

// ── METAR mesh ───────────────────────────────────────────────────────

export interface MetarStation {
  station_id: string
  name: string | null
  lat: number
  lon: number
  distance_km: number
  obs_time: string | null
  temp_c: number | null
  temp_f: number | null
  dewpoint_c: number | null
  dewpoint_f: number | null
  wind_dir_deg: number | null
  wind_speed_kt: number | null
  wind_gust_kt: number | null
  visibility_mi: number | null
  altimeter_hpa: number | null
  wx_string: string | null
  raw_metar: string | null
  flight_category: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'
}

export interface MetarMeshResponse {
  metars: MetarStation[]
  count: number
  lat: number
  lon: number
  radius_km: number
}

// ── Health ───────────────────────────────────────────────────────────

export interface SourceStatus { ok: boolean; status: number; error?: string }
export interface HealthResponse {
  status: string
  sources: Record<string, SourceStatus>
}

// ── Local Storm Reports (IEM LSR feed) ──────────────────────────────

export type LsrCategory = 'tornado' | 'hail' | 'wind' | 'flood' | 'lightning' | 'winter' | 'fire' | 'other'

export interface LocalStormReport {
  valid: string | null
  type: string
  category: LsrCategory
  magnitude: number | string | null
  city: string | null
  county: string | null
  state: string | null
  wfo: string | null
  source: string | null
  remark: string | null
  lat: number
  lon: number
}

export interface LsrResponse {
  geojson: GeoJSON.FeatureCollection
  items: LocalStormReport[]
  by_category: Record<LsrCategory, number>
  count: number
  hours: number
}

// ── Single-site NEXRAD (Iowa Mesonet RIDGE) ─────────────────────────

export interface NexradSite {
  id: string
  name: string
  lat: number
  lon: number
  distance_km: number
}

export interface NexradProduct {
  code: string
  label: string
  group: string
}

export interface NexradSitesResponse {
  sites: NexradSite[]
  products: NexradProduct[]
}

export interface NexradTimestampResponse {
  site: string
  product: string
  tile_template: string
  valid: string | null
  metadata: Record<string, unknown>
}

// ── NWS text products ─────────────────────────────────────────────

export interface NwsTextProduct {
  id: string
  wfo?: string
  product: string
  issued: string | null
  text: string
  stripped_text: string
  fetched_at: number
}

// ── NHC 7-day Tropical Weather Outlook ────────────────────────────

export interface TropicalDisturbance {
  basin: 'AT' | 'EP'
  title: string
  link: string
  pub_date: string | null
  description: string
  two_day: { category: 'low' | 'medium' | 'high'; probability: string } | null
  seven_day: { category: 'low' | 'medium' | 'high'; probability: string } | null
}

export interface TropicalOutlookResponse {
  atlantic: TropicalDisturbance[]
  east_pacific: TropicalDisturbance[]
  count: number
}

// ── AirNow AQI ────────────────────────────────────────────────────

export interface AqiObservation {
  parameter: string
  aqi: number
  category: { name: string; color: string; band: number }
  reporting_area: string | null
  state: string | null
  latitude?: number
  longitude?: number
  datetime_observed: string
}

export interface AqiCurrent {
  lat: number
  lon: number
  observations: AqiObservation[]
  dominant: AqiObservation | null
  count: number
}

// ── HRRR forecast loop ────────────────────────────────────────────

export interface HrrrFrame {
  fh: number
  valid_utc: string
  valid_local_label: string
  url: string
}

export interface HrrrForecastResponse {
  model: 'HRRR' | 'HRRR-Smoke'
  field: string
  run_utc: string
  run_label: string
  frames: HrrrFrame[]
  page: string
  sector?: string
}

// ── AI briefing ───────────────────────────────────────────────────

export interface BriefingResponse {
  text: string
  model: string
  context: { alerts_count: number; lsrs_count: number; has_afd: boolean; has_hwo: boolean }
  generated_at: number
  lat: number
  lon: number
}

// ── Time machine ──────────────────────────────────────────────────

export interface TimeMachineSnapshotMeta {
  ts: number
  alert_count: number
  lsr_count: number
  tornado_count: number
  hail_count: number
  wind_count: number
}

export interface TimeMachineListResponse {
  ready: boolean
  interval_sec: number
  retention_hours: number
  count: number
  snapshots: TimeMachineSnapshotMeta[]
}

export interface TimeMachineSnapshot {
  ts: number
  snapshot_ts: number
  lat: number
  lon: number
  alerts: { features: NWSAlert[] }
  lsrs: GeoJSON.FeatureCollection
}

// ── Storm cells ───────────────────────────────────────────────────

export interface StormCell {
  lat: number
  lon: number
  nexrad: string | null
  storm_id: string | null
  azimuth: number | null
  range_nm: number | null
  tvs: string | null
  meso: string | null
  drct: number | null
  sknt: number | null
  top_kft: number | null
  vil: number | null
  max_dbz: number | null
  max_dbz_height_kft: number | null
  poh: number | null
  posh: number | null
  max_size_in: number | null
  valid: string | null
}

export interface StormCellsResponse {
  cells: StormCell[]
  count: number
}

// ── Wildfires ─────────────────────────────────────────────────────

export interface Wildfire {
  lat: number
  lon: number
  name: string | null
  type: string | null
  discovered: string | number | null
  acres: number | null
  cause: string | null
  state: string | null
}

export interface WildfiresResponse {
  fires: Wildfire[]
  count: number
}

// ── Earthquakes ───────────────────────────────────────────────────

export interface Quake {
  lat: number
  lon: number
  depth_km: number | null
  mag: number | null
  place: string | null
  time_ms: number | null
  felt: number | null
  tsunami: number | null
  url: string | null
  alert: string | null
  type: string | null
}

export interface QuakesResponse {
  quakes: Quake[]
  count: number
  period: '1h' | '1d' | '7d'
}

// ── Lightning Potential ──────────────────────────────────────────

export interface LightningHourly {
  time: string
  lightning_potential: number | null
  cape: number | null
  cin: number | null
  thunderstorm_probability: number | null
}

export interface LightningResponse {
  lat: number
  lon: number
  hours: number
  items: LightningHourly[]
  peak_lpi: number | null
  peak_thunderstorm_probability: number | null
}

// ── Spotter Network ──────────────────────────────────────────────

export interface Spotter {
  lat: number
  lon: number
  callsign: string | null
  last_seen: string | null
  motion: string | null
  direction_deg: number | null
  icon_row: number | null
  phone: string | null
  email: string | null
  im: string | null
  web: string | null
}

export interface SpottersResponse {
  spotters: Spotter[]
  total_in_feed: number
  count: number
  fetched_at: number
}

// ── Alert prioritization (Ollama) ────────────────────────────────

export interface PrioritizeResponse {
  order: string[]            // alert IDs in priority order (highest first)
  reasoning: string
  source: 'ollama' | 'fallback' | 'none'
  model?: string
  error?: string
}

// ── Aviation ──────────────────────────────────────────────────────

export interface TafEntry {
  icao: string | null
  name: string | null
  lat: number
  lon: number
  distance_km: number
  issue_time: string | null
  valid_from: string | null
  valid_to: string | null
  raw_taf: string | null
}

export interface PirepEntry {
  lat: number
  lon: number
  obs_time: string | null
  aircraft_type: string | null
  altitude_ft: number | null
  report_type: string | null
  turbulence: unknown
  icing: unknown
  wx_string: string | null
  raw_text: string | null
}

// ── Marine ────────────────────────────────────────────────────────

export interface BuoyObs {
  wind_dir_deg: number | null
  wind_speed_ms: number | null
  wind_gust_ms: number | null
  wave_height_m: number | null
  dom_period_s: number | null
  pressure_mbar: number | null
  air_temp_c: number | null
  water_temp_c: number | null
}
export interface BuoyEntry {
  station_id: string
  name: string
  lat: number
  lon: number
  distance_km: number
  obs: BuoyObs
}

export interface TideEntry {
  station_id: string
  name: string
  lat: number
  lon: number
  distance_km: number
  water_level: { time: string | null; value_ft: number | null }
}

// ── Verification ──────────────────────────────────────────────────

export interface VerificationBucket {
  events: number
  verified: number
  lead_times_min: number[]
  avg_lead_min: number | null
  verification_pct: number | null
}
export interface VerificationResponse {
  events: Array<{
    type: string
    valid: string
    lat: number
    lon: number
    city: string | null
    state: string | null
    lead_time_min: number | null
    verified: boolean
  }>
  summary: {
    tornado: VerificationBucket
    severe: VerificationBucket
    flood: VerificationBucket
  }
  total_lsrs: number
}

// ── Cell tracks ───────────────────────────────────────────────────

export interface CellTrackPoint {
  lat: number
  lon: number
  valid: string | null
  max_dbz: number | null
  sknt: number | null
  drct: number | null
  tvs: string | null
  meso: string | null
  ts: number
}
export interface CellTrack {
  key: string
  nexrad: string | null
  storm_id: string | null
  points: CellTrackPoint[]
}

// ── Web push ──────────────────────────────────────────────────────

export interface WebPushKey {
  public_key: string
  ready: boolean
  have_pywebpush: boolean
}
